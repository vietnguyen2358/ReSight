import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { navigatorAgent } from "./navigator";
import { scribeAgent, getFullContext } from "./scribe";
import { guardianAgent } from "./guardian";
import { thoughtEmitter } from "@/lib/thought-stream/emitter";
import type { AgentResult } from "./types";

const ORCHESTRATOR_SYSTEM = `You are Gideon, the AI orchestrator for a voice-controlled web browser designed for visually impaired users.

You receive user instructions and decide which sub-agents to deploy:

1. **navigate** — Use when the user wants to browse, click, search, interact with web pages.
2. **remember** — Use when the user wants to store or recall personal preferences/information.
3. **safety_check** — Use BEFORE any action involving purchases, downloads, or entering personal information.

Always think step by step. For complex tasks, chain multiple tool calls.
For navigation, be specific about what you want the browser to do.
Always respond naturally to the user — tell them what you did and what you see.`;

function sendThought(agent: string, message: string) {
  thoughtEmitter.sendThought(agent, message);
}

const openrouter = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

async function runWithModel(
  model: ReturnType<typeof google> | ReturnType<typeof openrouter>,
  instruction: string,
  userContext: ReturnType<typeof getFullContext>
) {
  return generateText({
    model,
    system: ORCHESTRATOR_SYSTEM,
    prompt: `User context: ${JSON.stringify(userContext)}\n\nUser instruction: "${instruction}"`,
    stopWhen: stepCountIs(5),
    tools: {
      navigate: tool({
        description:
          "Navigate the web browser. Use for browsing, clicking, searching, or any web interaction.",
        inputSchema: z.object({
          instruction: z
            .string()
            .describe("Specific browser action to perform"),
        }),
        execute: async ({ instruction }) => {
          const result = await navigatorAgent(instruction, sendThought);
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
          const result = await scribeAgent(action, key, value, sendThought);
          return result;
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
          const result = await guardianAgent(
            action,
            pageContext,
            sendThought
          );
          return result;
        },
      }),
    },
  });
}

export async function runOrchestrator(instruction: string): Promise<AgentResult> {
  sendThought("Orchestrator", `Processing: "${instruction}"`);

  // Load user context for injection
  const userContext = getFullContext(sendThought);

  try {
    let response;
    try {
      response = await runWithModel(
        google("gemini-2.0-flash"),
        instruction,
        userContext
      );
    } catch (geminiError) {
      const geminiMsg =
        geminiError instanceof Error ? geminiError.message : "Unknown Gemini error";
      sendThought("Orchestrator", `Gemini failed, trying OpenRouter: ${geminiMsg}`);

      if (!process.env.OPENROUTER_API_KEY) {
        throw geminiError;
      }

      const openrouterModel =
        process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
      response = await runWithModel(
        openrouter(openrouterModel),
        instruction,
        userContext
      );
    }

    const { text, toolResults } = response;
    const hasToolExecution = Array.isArray(toolResults) && toolResults.length > 0;
    const likelyBrowserIntent =
      /search|find|look|open|click|buy|add to cart|checkout|review|ingredients|nutrition|price|amazon|google|website|page/i.test(
        instruction
      );

    if (!hasToolExecution && likelyBrowserIntent) {
      sendThought("Orchestrator", "No tool call produced; forcing Navigator action.");
      const nav = await navigatorAgent(instruction, sendThought);
      return nav;
    }

    // Check if any tool required confirmation
    const needsConfirmation = toolResults?.some(
      (r) =>
        r.output &&
        typeof r.output === "object" &&
        "confirmationRequired" in r.output &&
        (r.output as Record<string, unknown>).confirmationRequired
    );

    sendThought("Orchestrator", "Task complete");

    return {
      success: true,
      message: text || "Action completed",
      confirmationRequired: needsConfirmation || false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    sendThought("Orchestrator", `Error: ${errorMsg}`);
    return {
      success: false,
      message: `Error: ${errorMsg}`,
    };
  }
}
