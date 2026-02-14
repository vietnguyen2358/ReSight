import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { SendThoughtFn, AgentResult } from "./types";

const GUARDIAN_SYSTEM = `You are the Guardian agent, responsible for user safety and anti-dark-pattern analysis.
Analyze the requested action and determine if it is safe to proceed.

You must respond with a JSON object:
{
  "safe": boolean,
  "reason": string,
  "confirmationRequired": boolean
}

Flag as unsafe or requiring confirmation if:
- The action involves financial transactions (buying, subscribing, paying)
- The action involves entering personal information (PII, passwords, credit cards)
- The action involves downloading files
- The element looks like a dark pattern (hidden costs, misleading buttons, forced opt-ins)
- The action could have irreversible consequences

Be concise in your reasoning.`;

export async function guardianAgent(
  action: string,
  pageContext: string,
  sendThought: SendThoughtFn
): Promise<AgentResult> {
  sendThought("Guardian", `Analyzing safety of: "${action}"`);

  try {
    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      system: GUARDIAN_SYSTEM,
      prompt: `Action requested: "${action}"\n\nPage context: ${pageContext}`,
      maxOutputTokens: 300,
    });

    const analysis = JSON.parse(text);
    const { safe, reason, confirmationRequired } = analysis;

    if (!safe) {
      sendThought("Guardian", `BLOCKED: ${reason}`);
      return {
        success: false,
        message: `Action blocked: ${reason}`,
        confirmationRequired: true,
      };
    }

    if (confirmationRequired) {
      sendThought("Guardian", `Confirmation needed: ${reason}`);
      return {
        success: true,
        message: reason,
        confirmationRequired: true,
      };
    }

    sendThought("Guardian", "Action approved — safe to proceed");
    return {
      success: true,
      message: "Action approved",
      confirmationRequired: false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    sendThought("Guardian", `Analysis error: ${errorMsg}`);
    // Default to requiring confirmation on error
    return {
      success: true,
      message: "Could not analyze — requesting user confirmation",
      confirmationRequired: true,
    };
  }
}
