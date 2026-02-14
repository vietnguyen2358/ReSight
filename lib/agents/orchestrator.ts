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

const ORCHESTRATOR_SYSTEM = `You are Gideon, the orchestrator for a voice-controlled web browser for visually impaired users.

You receive user instructions and route them to the right tool:

1. **navigate** — For ANY web browsing task: searching, visiting sites, clicking, reading page content, finding products, getting information, etc. Pass the user's FULL instruction — the navigator will break it into steps.
2. **remember** — Store or recall user preferences and personal information.
3. **safety_check** — Use BEFORE purchases, downloads, or entering personal info.

RULES:
- For web tasks, call navigate ONCE with the complete user request. Do NOT break it into multiple navigate calls — the navigator handles multi-step navigation internally.
- After navigate returns, relay its result to the user naturally.
- Keep your response concise — 1-2 sentences describing what was found or done.
- If the user mentions a preference (e.g., "I like vanilla", "my address is..."), call remember to store it.
- If the task involves money, PII, or downloads, call safety_check FIRST, then navigate.`;

function sendThought(agent: string, message: string) {
  thoughtEmitter.sendThought(agent, message);
}

export async function runOrchestrator(instruction: string): Promise<AgentResult> {
  devLog.info("orchestrator", `New instruction: "${instruction}"`);
  const lower = instruction.trim().toLowerCase();

  // 1. If there's a pending clarification question, route the input as the answer
  if (hasPendingQuestion()) {
    devLog.info("orchestrator", `Routing as clarification answer: "${instruction}"`);
    sendThought("Orchestrator", `Passing your response to the navigator...`);
    answerQuestion(instruction.trim());
    return { success: true, message: "Got it, continuing with your answer." };
  }

  // 2. Stop/cancel commands — set abort flag
  if (/^(stop|cancel|wait|never\s*mind|halt|pause)$/i.test(lower)) {
    devLog.info("orchestrator", `Stop command detected: "${instruction}"`);
    requestAbort();
    sendThought("Orchestrator", "Stopping current task...");
    return { success: true, message: "Okay, I've stopped." };
  }

  // 3. Go back command — navigate browser back
  if (/^(go\s*back|back|undo|previous(\s*page)?)$/i.test(lower)) {
    devLog.info("orchestrator", `Go back command detected`);
    sendThought("Orchestrator", "Going back to the previous page...");
    try {
      const stagehand = await getStagehand();
      const page = stagehand.context.activePage();
      if (page) {
        await page.goBack({ waitUntil: "domcontentloaded", timeoutMs: 10000 }).catch(() => {});
        await page.waitForTimeout(1500);
        await captureScreenshot(page);
        const title = await page.title().catch(() => page.url());
        sendThought("Narrator", `Went back. Now on: "${title}"`);
        return { success: true, message: `Went back to: ${title}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Couldn't go back: ${msg}` };
    }
  }

  // Normal request — clear any previous abort flag
  clearAbort();

  sendThought("Orchestrator", `Processing: "${instruction}"`);

  // Inter-agent: Orchestrator announces to council
  sendThought("Orchestrator → Council", `New task received. Analyzing intent: "${instruction}"`);

  const userContext = getFullContext(sendThought);
  devLog.debug("orchestrator", "User context loaded", { context: userContext });

  // Orchestrator reasoning visible in thought stream
  const contextKeys = Object.keys(userContext).filter((k) => !k.startsWith("_"));
  if (contextKeys.length > 0) {
    sendThought("Orchestrator", `User context available: ${contextKeys.join(", ")}`);
  }

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
            sendThought("Orchestrator → Navigator", `Dispatching web task: "${navInstruction}"`);
            const result = await navigatorAgent(navInstruction, sendThought);
            devLog.info("orchestrator", `navigate returned`, {
              success: result.success,
              messagePreview: result.message?.substring(0, 200),
            });

            // Learn from successful navigations
            if (result.success && result.message) {
              sendThought("Orchestrator → Scribe", `Task succeeded. Saving navigation pattern for future reference.`);
              try {
                // Extract a simple pattern from the instruction
                const pattern = navInstruction.substring(0, 100);
                const steps = result.message.substring(0, 200);
                saveLearnedFlow(pattern, steps);
              } catch {
                // ignore save errors
              }
            }

            sendThought("Orchestrator", `Navigator returned: ${result.success ? "success" : "failed"}`);
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
            sendThought("Orchestrator → Scribe", `${action === "store" ? "Store" : "Recall"} preference: "${key}"`);
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
            sendThought("Orchestrator → Guardian", `Safety review requested: "${action}"`);
            const result = await guardianAgent(action, pageContext, sendThought);
            sendThought("Guardian → Orchestrator", `Verdict: ${result.success ? "approved" : "blocked"} — ${result.message}`);
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
      sendThought("Orchestrator", "No tool called — routing to navigator directly");
      sendThought("Orchestrator → Navigator", `Fallback dispatch: "${instruction}"`);
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
    sendThought("Orchestrator", "Done — preparing response");

    return {
      success: true,
      message: text || "Action completed.",
      confirmationRequired: needsConfirmation || false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    done({ error: errorMsg }, "error");
    devLog.error("orchestrator", `Orchestrator failed: ${errorMsg}`);
    sendThought("Orchestrator", `Error: ${errorMsg}`);
    return {
      success: false,
      message: `Sorry, something went wrong: ${errorMsg}`,
    };
  }
}
