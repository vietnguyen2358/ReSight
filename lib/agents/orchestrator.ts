import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { navigatorAgent } from "./navigator";
import { scribeAgent, getFullContext } from "./scribe";
import { guardianAgent } from "./guardian";
import { thoughtEmitter } from "@/lib/thought-stream/emitter";
import type { AgentResult } from "./types";

function getModel() {
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (googleKey) {
    return google("gemini-2.0-flash");
  }
  const openrouter = createOpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  });
  return openrouter.chat(process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini");
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
  sendThought("Orchestrator", `Processing: "${instruction}"`);

  const userContext = getFullContext(sendThought);

  try {
    const { text, toolResults } = await generateText({
      model: getModel(),
      system: ORCHESTRATOR_SYSTEM,
      prompt: `User preferences: ${JSON.stringify(userContext)}\n\nUser says: "${instruction}"`,
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
            return await navigatorAgent(instruction, sendThought);
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
            return await guardianAgent(action, pageContext, sendThought);
          },
        }),
      },
    });

    // If the model didn't call any tools but the instruction looks like a browser task, force navigate
    const hasToolExecution = Array.isArray(toolResults) && toolResults.length > 0;
    if (!hasToolExecution) {
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

    sendThought("Orchestrator", "Done");

    return {
      success: true,
      message: text || "Action completed.",
      confirmationRequired: needsConfirmation || false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    sendThought("Orchestrator", `Error: ${errorMsg}`);
    return {
      success: false,
      message: `Sorry, something went wrong: ${errorMsg}`,
    };
  }
}
