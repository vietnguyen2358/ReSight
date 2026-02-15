import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { SendThoughtFn, AgentResult } from "./types";

const GUARDIAN_SYSTEM = `You are the Guardian agent. You protect blind users from dark patterns and scams, but you do NOT get in the way of legitimate purchases the user has asked for.

Respond with JSON:
{ "safe": boolean, "reason": string, "confirmationRequired": boolean }

SAFE (safe:true, confirmationRequired:false):
- User explicitly asked to buy/order something — they already consented
- Normal shopping actions: searching, browsing, adding to cart, checkout
- Entering login credentials the user volunteered
- Routine web browsing

NEEDS ONE CONFIRMATION (safe:true, confirmationRequired:true):
- Subscriptions with recurring charges
- Downloading executable files
- Entering payment info on a site the user didn't specifically ask to use

BLOCK (safe:false):
- Clear dark patterns: hidden fees, pre-checked boxes adding unwanted services, misleading "free trial" that auto-charges
- Phishing or suspicious sites
- Actions the user clearly did NOT ask for

IMPORTANT: If the user said "order this" or "buy this" or "add to cart" — that IS their consent. Do NOT block or require confirmation for purchases the user requested. Be concise.`;

function parseGuardianResponse(text: string): { safe: boolean; reason: string; confirmationRequired: boolean } {
  // Strip markdown code fences if present (Gemini often wraps JSON in ```json ... ```)
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: try to extract JSON from anywhere in the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    // If all parsing fails, default to safe with confirmation
    return { safe: true, reason: "Could not parse safety analysis", confirmationRequired: true };
  }
}

export async function guardianAgent(
  action: string,
  pageContext: string,
  sendThought: SendThoughtFn,
  conversationContext?: string
): Promise<AgentResult> {
  sendThought("Guardian", `Analyzing safety of: "${action}"`);

  try {
    let prompt = `Action requested: "${action}"\n\nPage context: ${pageContext}`;
    if (conversationContext) {
      prompt += `\n\nConversation context (user already said these things):\n${conversationContext}`;
    }

    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      system: GUARDIAN_SYSTEM,
      prompt,
      maxOutputTokens: 300,
    });

    const analysis = parseGuardianResponse(text);
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
