import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { navigatorAgent } from "./navigator";
import { scribeAgent, getFullContext, saveLearnedFlow } from "./scribe";
import { guardianAgent } from "./guardian";
import { thoughtEmitter } from "@/lib/thought-stream/emitter";
import { devLog } from "@/lib/dev-logger";
import { requestAbort, clearAbort } from "./cancellation";
import { hasPendingQuestion, answerQuestion } from "./clarification";
import { getStagehand } from "@/lib/stagehand/session";
import { captureScreenshot } from "@/lib/stagehand/screenshot";
import type { AgentResult } from "./types";

function getModel() {
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (openrouterKey) {
    const modelName = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
    devLog.info("llm", `Orchestrator using OpenRouter: ${modelName}`);
    const openrouter = createOpenAI({
      apiKey: openrouterKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return openrouter.chat(modelName);
  }
  if (googleKey) {
    devLog.info("llm", "Orchestrator using Google Gemini: gemini-2.0-flash");
    return google("gemini-2.0-flash");
  }
  throw new Error("No LLM API key configured. Set GOOGLE_GENERATIVE_AI_API_KEY or OPENROUTER_API_KEY.");
}

const ORCHESTRATOR_SYSTEM = `You are Gideon, a friendly voice assistant that helps blind users browse the web. You're like a helpful friend sitting next to them, controlling their computer for them.

You receive what the user says and decide what to do:

1. **navigate** — For ANY web browsing task. Pass the user's FULL request — the navigator handles multi-step browsing internally.
2. **remember** — Store or recall user preferences (e.g., "I like vanilla", "my address is...").
3. **safety_check** — Use BEFORE purchases, downloads, or entering personal info.

HOW TO RESPOND:
- Be conversational and natural — like talking to a friend, not a computer
- After navigate returns, relay what was found in a natural, spoken way
- Keep responses concise but warm: "Here's what I found..." not "Query executed successfully"
- Your response will be SPOKEN ALOUD to the user, so write it like speech
- For web tasks, call navigate ONCE with the complete request
- If something involves money or personal info, call safety_check FIRST`;

function sendThought(agent: string, message: string) {
  thoughtEmitter.sendThought(agent, message);
}

export async function runOrchestrator(instruction: string): Promise<AgentResult> {
  devLog.info("orchestrator", `New instruction: "${instruction}"`);
  const lower = instruction.trim().toLowerCase();

  // 1. If there's a pending clarification question, route the input as the answer
  if (hasPendingQuestion()) {
    devLog.info("orchestrator", `Routing as clarification answer: "${instruction}"`);
    sendThought("Narrator", `Got it — passing your answer along...`);
    answerQuestion(instruction.trim());
    return { success: true, message: "Got it, continuing with your answer." };
  }

  // 2. Stop/cancel commands — set abort flag
  if (/^(stop|cancel|wait|never\s*mind|halt|pause)$/i.test(lower)) {
    devLog.info("orchestrator", `Stop command detected: "${instruction}"`);
    requestAbort();
    sendThought("Narrator", "Okay, stopping what I was doing.");
    return { success: true, message: "Okay, I've stopped." };
  }

  // 3. Go back command — navigate browser back
  if (/^(go\s*back|back|undo|previous(\s*page)?)$/i.test(lower)) {
    devLog.info("orchestrator", `Go back command detected`);
    sendThought("Narrator", "Going back to the previous page...");
    try {
      const stagehand = await getStagehand();
      const page = stagehand.context.activePage();
      if (page) {
        await page.goBack({ waitUntil: "domcontentloaded", timeoutMs: 10000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await captureScreenshot(page);
        const title = await page.title().catch(() => page.url());
        sendThought("Narrator", `Alright, I went back. We're now on "${title}".`);
        return { success: true, message: `Went back to ${title}.` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Couldn't go back: ${msg}` };
    }
  }

  // Normal request — clear any previous abort flag
  clearAbort();

  sendThought("Narrator", `On it — let me help you with that.`);

  const userContext = getFullContext(sendThought);
  devLog.debug("orchestrator", "User context loaded", { context: userContext });

  const prompt = `User preferences: ${JSON.stringify(userContext)}\n\nUser says: "${instruction}"`;
  const done = devLog.time("llm", "Orchestrator generateText call", {
    system: ORCHESTRATOR_SYSTEM.substring(0, 200) + "...",
    prompt,
  });

  try {
    const { text, toolResults, steps } = await generateText({
      model: getModel(),
      system: ORCHESTRATOR_SYSTEM,
      prompt,
      stopWhen: stepCountIs(4),
      tools: {
        navigate: tool({
          description:
            "Navigate the web browser to complete the user's task. Pass the full user instruction — the navigator breaks it into steps internally.",
          inputSchema: z.object({
            instruction: z
              .string()
              .describe("The user's full browsing instruction"),
          }),
          execute: async ({ instruction: navInstruction }) => {
            devLog.info("orchestrator", `Tool call: navigate("${navInstruction}")`);
            const result = await navigatorAgent(navInstruction, sendThought);
            devLog.info("orchestrator", `navigate returned`, {
              success: result.success,
              messagePreview: result.message?.substring(0, 200),
            });

            // Learn from successful navigations
            if (result.success && result.message) {
              try {
                const pattern = navInstruction.substring(0, 100);
                const steps = result.message.substring(0, 200);
                saveLearnedFlow(pattern, steps);
              } catch {
                // ignore save errors
              }
            }

            return result;
          },
        }),
        remember: tool({
          description:
            "Store or recall user preferences and personal information.",
          inputSchema: z.object({
            action: z.enum(["store", "recall"]).describe("Store or recall"),
            key: z.string().describe("The preference key"),
            value: z
              .string()
              .optional()
              .describe("Value to store (only for store action)"),
          }),
          execute: async ({ action, key, value }) => {
            devLog.info("orchestrator", `Tool call: remember(${action}, ${key})`);
            sendThought("Narrator", action === "store" ? `I'll remember that for you.` : `Let me check what I know about "${key}"...`);
            return await scribeAgent(action, key, value, sendThought);
          },
        }),
        safety_check: tool({
          description:
            "Check if an action is safe before proceeding. Use before purchases, downloads, or PII entry.",
          inputSchema: z.object({
            action: z.string().describe("The action to check"),
            pageContext: z
              .string()
              .describe("Current page context/description"),
          }),
          execute: async ({ action, pageContext }) => {
            devLog.info("orchestrator", `Tool call: safety_check("${action}")`);
            sendThought("Narrator", `Let me make sure this is safe before proceeding...`);
            const result = await guardianAgent(action, pageContext, sendThought);
            sendThought("Narrator", result.success ? `Looks safe, going ahead.` : `Hold on — ${result.message}`);
            return result;
          },
        }),
      },
    });

    done({
      responseText: text?.substring(0, 300),
      toolCallCount: toolResults?.length ?? 0,
      stepCount: steps?.length ?? 0,
    });

    // If the model didn't call any tools, force navigate
    const hasToolExecution = Array.isArray(toolResults) && toolResults.length > 0;
    if (!hasToolExecution) {
      devLog.warn("orchestrator", "No tools called by LLM, forcing navigator fallback");
      return await navigatorAgent(instruction, sendThought);
    }

    const needsConfirmation = toolResults?.some(
      (r) =>
        r.output &&
        typeof r.output === "object" &&
        "confirmationRequired" in r.output &&
        (r.output as Record<string, unknown>).confirmationRequired
    );

    devLog.info("orchestrator", "Orchestrator complete", {
      finalMessage: text?.substring(0, 200),
      needsConfirmation,
    });
    return {
      success: true,
      message: text || "All done!",
      confirmationRequired: needsConfirmation || false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    done({ error: errorMsg }, "error");
    devLog.error("orchestrator", `Orchestrator failed: ${errorMsg}`);
    sendThought("Narrator", `Sorry, I ran into a problem: ${errorMsg}`);
    return {
      success: false,
      message: `Sorry, something went wrong. ${errorMsg}`,
    };
  }
}
