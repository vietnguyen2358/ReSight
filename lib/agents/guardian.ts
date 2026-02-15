import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import type { SendThoughtFn, AgentResult } from "./types";

const GUARDIAN_SYSTEM = `You are the Guardian agent for ReSight, a browser for BLIND users. Your job is critical — blind users cannot visually inspect URLs, page layouts, or red flags that sighted users catch instantly. You are their eyes for safety.

Respond with JSON:
{ "safe": boolean, "reason": string, "confirmationRequired": boolean, "threatType": string }

threatType values: "none", "phishing", "scam", "dark_pattern", "data_harvesting", "malware", "sketchy_url", "fake_urgency", "unknown_risk"

## SAFE (safe:true, confirmationRequired:false)
- User explicitly asked to buy/order something — that's consent
- Normal shopping on known retailers (Amazon, Target, Walmart, Best Buy, etc.)
- Entering login credentials the user volunteered
- Routine web browsing on known sites
- Standard cookie consent banners

## NEEDS CONFIRMATION (safe:true, confirmationRequired:true)
- Subscriptions with recurring charges
- Downloading files (.exe, .dmg, .apk, .zip from unknown sources)
- Entering payment info on a site the user didn't specifically request
- Unknown/unfamiliar e-commerce sites (check: no HTTPS, recently registered domain, no reviews)
- Price significantly below market (>50% cheaper than major retailers = suspicious)
- Sites requesting unnecessary personal information (SSN, full DOB for a simple purchase)

## BLOCK (safe:false)
- **Shortened/obfuscated URLs**: bit.ly, tinyurl, t.co, goo.gl etc. with suspicious keywords ("free", "prize", "winner", "urgent", "claim")
- **Phishing patterns**: misspelled domains (amaz0n.com, g00gle.com), login pages on wrong domains, "verify your account" on non-official sites
- **Scam indicators**: "You've won!", "Congratulations!", countdown timers with "Act now!", fake virus warnings, "your computer is infected"
- **Dark patterns**: hidden fees revealed at checkout, pre-checked boxes adding unwanted services, misleading "free trial" that auto-charges, "negative option" designs where declining is hidden
- **Data harvesting**: forms asking for SSN/credit card/bank info that shouldn't need it, surveys that want extensive personal data
- **Malware risk**: prompts to install browser extensions, Flash/Java updates, "driver updates", executable downloads from unknown sources
- **Fake reviews/listings**: impossibly high review counts on unknown products, all reviews from same date, listing price mismatches

## CRITICAL RULES
- If the user said "order this" or "buy this" — that IS consent. Don't block legitimate purchases.
- When blocking, explain WHY in plain language a blind person can understand. They can't see the red flags — describe them.
- Be concise. 1-2 sentences for reason.
- Err on the side of caution for blind users — they literally cannot see visual scam cues that sighted users spot instantly. A false positive (blocking something safe) is better than letting a scam through.`;

interface GuardianAnalysis {
  safe: boolean;
  reason: string;
  confirmationRequired: boolean;
  threatType?: string;
}

function parseGuardianResponse(text: string): GuardianAnalysis {
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
    return { safe: true, reason: "Could not parse safety analysis", confirmationRequired: true, threatType: "unknown_risk" };
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
    const { safe, reason, confirmationRequired, threatType } = analysis;

    if (!safe) {
      const threatLabel = threatType && threatType !== "none" ? ` [${threatType}]` : "";
      sendThought("Guardian", `BLOCKED${threatLabel}: ${reason}`);
      return {
        success: false,
        message: reason,
        confirmationRequired: true,
        data: { threatType: threatType || "unknown_risk" },
      };
    }

    if (confirmationRequired) {
      sendThought("Guardian", `Heads up — ${reason}`);
      return {
        success: true,
        message: reason,
        confirmationRequired: true,
        data: { threatType: threatType || "unknown_risk" },
      };
    }

    sendThought("Guardian", "Looks safe — good to go");
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
