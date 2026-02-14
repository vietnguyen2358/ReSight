import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { navigatorAgent } from "./navigator";
import { scribeAgent, getFullContext } from "./scribe";
import { guardianAgent } from "./guardian";
import { thoughtEmitter } from "@/lib/thought-stream/emitter";
import { devLog } from "@/lib/dev-logger";
import type { AgentResult } from "./types";

function getModel() {
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  // Prefer OpenRouter for agent LLM calls (cheaper), fall back to Google
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
2. **remember** — Store or recall user preferences.
3. **safety_check** — Use BEFORE purchases, downloads, or entering personal info.

RULES:
- For web tasks, call navigate ONCE with the complete user request. Do NOT break it into multiple navigate calls — the navigator handles that internally.
- After navigate returns, relay its result to the user naturally.
- Keep your response concise — 1-2 sentences describing what was found.`;

function sendThought(agent: string, message: string) {
  thoughtEmitter.sendThought(agent, message);
}

export async function runOrchestrator(instruction: string): Promise<AgentResult> {
  devLog.info("orchestrator", `New instruction: "${instruction}"`);
  sendThought("Orchestrator", `Processing: "${instruction}"`);

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
          execute: async ({ instruction }) => {
            devLog.info("orchestrator", `Tool call: navigate("${instruction}")`);
            const result = await navigatorAgent(instruction, sendThought);
            devLog.info("orchestrator", `navigate returned`, {
              success: result.success,
              messagePreview: result.message?.substring(0, 200),
            });
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
            return await guardianAgent(action, pageContext, sendThought);
          },
        }),
      },
    });

    done({
      responseText: text?.substring(0, 300),
      toolCallCount: toolResults?.length ?? 0,
      stepCount: steps?.length ?? 0,
    });

    // If the model didn't call any tools but the instruction looks like a browser task, force navigate
    const hasToolExecution = Array.isArray(toolResults) && toolResults.length > 0;
    if (!hasToolExecution) {
      devLog.warn("orchestrator", "No tools called by LLM, forcing navigator fallback");
      sendThought("Orchestrator", "No tool called, routing to navigator directly.");
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
    sendThought("Orchestrator", "Done");

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
