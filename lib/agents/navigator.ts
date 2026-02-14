import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { getStagehand } from "@/lib/stagehand/session";
import { captureScreenshot, setLatestScreenshot } from "@/lib/stagehand/screenshot";
import type { SendThoughtFn, AgentResult } from "./types";

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

const NAVIGATOR_SYSTEM = `You are a browser navigation agent. You execute step-by-step browser actions to complete tasks.

Tools:
1. goto_url — Navigate to a URL
2. do_action — Perform ONE simple action (click, type, scroll, press Enter, etc.)
3. extract_info — Read/extract specific information from the current page
4. done — Signal task completion with a summary

CRITICAL RULES:
- You MUST complete the ENTIRE task. Do NOT stop after just navigating to a website — continue with searching, clicking, reading, etc.
- Break every task into simple, atomic steps. NEVER combine multiple actions in one do_action call.
- ALWAYS start by navigating to the right website with goto_url.
- After goto_url, you will receive the page content and interactive elements. Use this to decide your next action.
- For searching on a site: first goto_url, then do_action("click the search box" or "click the search input field"), then do_action("type 'your query' in the search box"), then do_action("press Enter").
- For clicking results: do_action("click the first result about X").
- For reading info: use extract_info with a specific question.
- When you have the answer or the task is fully done, call done with a concise, natural summary.
- If an action fails, try an alternative approach (e.g., different element description, scroll first, etc.)
- NEVER call done until you have actually completed the task. Navigating to a website is NOT completing the task — you must also perform the search/action requested.

EXAMPLE — "find protein powder on target":
1. goto_url("https://www.target.com")
2. do_action("click the search input field")
3. do_action("type 'protein powder' in the search input")
4. do_action("press Enter")
5. extract_info("What protein powder products are shown with their prices?")
6. done("I found several protein powders on Target: ...")`;

async function getPageContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stagehand?: any
) {
  const url = page.url();
  const title = await page.title().catch(() => "");

  // Grab visible text so the LLM knows what's on the page
  const visibleText: string = await page
    .evaluate(() => (document.body.innerText || "").substring(0, 4000))
    .catch(() => "");

  const ctx: Record<string, unknown> = {
    currentUrl: url,
    pageTitle: title,
    pageContent: visibleText.substring(0, 2500),
  };

  // If stagehand provided, observe interactive elements so LLM can target them
  if (stagehand) {
    try {
      const elements = await stagehand.observe("interactive elements on the page");
      if (Array.isArray(elements) && elements.length > 0) {
        ctx.interactiveElements = elements
          .slice(0, 15)
          .map((e: { description?: string }) => e.description || String(e));
      }
    } catch (err) {
      console.log("[Navigator] observe() failed, continuing with text context:", err);
    }
  }

  return ctx;
}

export async function navigatorAgent(
  instruction: string,
  sendThought: SendThoughtFn
): Promise<AgentResult> {
  console.log(`\n[Navigator] ========== START: "${instruction}" ==========`);
  sendThought("Navigator", `Task: "${instruction}"`);

  try {
    const stagehand = await getStagehand();
    const page = stagehand.context.activePage();
    if (!page) throw new Error("No active page available");

    console.log(`[Navigator] Active page URL: ${page.url()}`);
    const startCtx = await getPageContext(page);
    let finalMessage = "";

    const { text } = await generateText({
      model: getModel(),
      system: NAVIGATOR_SYSTEM,
      prompt: `Current URL: ${startCtx.currentUrl}\nPage title: ${startCtx.pageTitle || "(blank)"}\n\nTask: ${instruction}`,
      stopWhen: stepCountIs(12),
      tools: {
        goto_url: tool({
          description: "Navigate the browser to a URL.",
          inputSchema: z.object({
            url: z.string().describe("The URL to navigate to (e.g. https://www.target.com)"),
          }),
          execute: async ({ url }) => {
            let fullUrl = url;
            if (!fullUrl.startsWith("http")) fullUrl = `https://${fullUrl}`;
            console.log(`[Navigator] goto_url: ${fullUrl}`);
            sendThought("Navigator", `Going to ${fullUrl}`);
            try {
              await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
            } catch {
              // Sometimes domcontentloaded times out on heavy pages, still continue
              sendThought("Navigator", "Page load slow, continuing anyway");
            }
            await page.waitForTimeout(2000); // let page render
            await captureScreenshot(page);
            const ctx = await getPageContext(page, stagehand);
            console.log(`[Navigator] goto_url result:`, JSON.stringify(ctx).substring(0, 500));
            return ctx;
          },
        }),

        do_action: tool({
          description:
            "Perform ONE simple action on the current page. Be very specific. Good: 'click the search box', 'type optimum protein in the search field', 'press Enter', 'click the first product result', 'scroll down'. Bad: 'search for protein and click the first result' (too many actions).",
          inputSchema: z.object({
            action: z.string().describe("A single, specific action"),
          }),
          execute: async ({ action }) => {
            console.log(`[Navigator] do_action: "${action}"`);
            sendThought("Navigator", `Action: "${action}"`);
            try {
              await stagehand.act(action);
              console.log(`[Navigator] do_action completed: "${action}"`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.log(`[Navigator] do_action FAILED: "${action}" → ${msg}`);
              sendThought("Navigator", `Action failed: ${msg}`);
              await captureScreenshot(page);
              const errCtx = await getPageContext(page);
              return { ...errCtx, error: msg };
            }
            // Wait for the page to settle after the action
            await page.waitForTimeout(2000);
            await captureScreenshot(page);
            const ctx = await getPageContext(page, stagehand);
            console.log(`[Navigator] do_action result:`, JSON.stringify(ctx).substring(0, 500));
            return ctx;
          },
        }),

        extract_info: tool({
          description:
            "Extract specific information visible on the current page. Use for reading text, prices, nutrition facts, descriptions, etc.",
          inputSchema: z.object({
            instruction: z.string().describe("What information to extract from the page"),
          }),
          execute: async ({ instruction: extractInstruction }) => {
            console.log(`[Navigator] extract_info: "${extractInstruction}"`);
            sendThought("Navigator", `Extracting: "${extractInstruction}"`);
            try {
              const result = await stagehand.extract(extractInstruction);
              console.log(`[Navigator] extract_info result:`, JSON.stringify(result).substring(0, 500));
              await captureScreenshot(page);
              return result;
            } catch (err) {
              // Fallback: grab visible text from the page
              sendThought("Navigator", "Extract failed, reading page text");
              const text = await page.evaluate(() => {
                return document.body.innerText.substring(0, 3000);
              }).catch(() => "Could not read page text");
              await captureScreenshot(page);
              return { pageText: text };
            }
          },
        }),

        done: tool({
          description: "Call when the task is fully complete. Provide a natural summary of what you found or did.",
          inputSchema: z.object({
            summary: z.string().describe("Concise summary of results for the user"),
          }),
          execute: async ({ summary }) => {
            console.log(`[Navigator] done: "${summary}"`);
            sendThought("Navigator", "Task complete");
            finalMessage = summary;
            await captureScreenshot(page);
            return { done: true };
          },
        }),
      },
    });

    const message = finalMessage || text || `Completed. Currently on: ${page.url()}`;
    console.log(`[Navigator] ========== DONE: "${message.substring(0, 200)}" ==========\n`);
    return { success: true, message };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    sendThought("Navigator", `Error: ${errorMsg}`);

    // Try a simple direct navigation as last resort
    try {
      const stagehand = await getStagehand();
      const page = stagehand.context.activePage();
      if (page) {
        const url = buildSearchUrl(instruction);
        sendThought("Navigator", `Fallback: loading ${url}`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        await captureScreenshot(page);
        return {
          success: true,
          message: `I opened a search for that. Currently on: ${page.url()}`,
        };
      }
    } catch {
      // ignore fallback errors
    }

    return { success: false, message: `Navigation failed: ${errorMsg}` };
  }
}

function buildSearchUrl(instruction: string): string {
  const trimmed = instruction.trim();

  // Check for direct URLs
  const urlMatch = trimmed.match(
    /\b(https?:\/\/[^\s]+|(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)\b/i
  );
  if (urlMatch) {
    const candidate = urlMatch[1];
    return candidate.startsWith("http") ? candidate : `https://${candidate}`;
  }

  // Check for specific sites mentioned
  const siteMatch = trimmed.match(/\bon\s+(target|amazon|walmart|google|ebay|costco)(?:'s)?/i);
  if (siteMatch) {
    const site = siteMatch[1].toLowerCase();
    const query = trimmed
      .replace(/\bon\s+\w+(?:'s)?\s*(website|site|\.com)?\b/gi, "")
      .replace(/\b(search|find|look)\s*(for|up)?\b/gi, "")
      .replace(/\b(and|give|tell|show|me|the|get)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    return `https://www.${site}.com/s?searchTerm=${encodeURIComponent(query)}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}
