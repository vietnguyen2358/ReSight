import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { getStagehand } from "@/lib/stagehand/session";
import { captureScreenshot } from "@/lib/stagehand/screenshot";
import { devLog } from "@/lib/dev-logger";
import { getLearnedFlows } from "./scribe";
import { isAborted, setLastUrl } from "./cancellation";
import { askQuestion } from "./clarification";
import type { SendThoughtFn, AgentResult } from "./types";

function getModel() {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (openrouterKey) {
    const modelName = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
    devLog.info("llm", `Navigator using OpenRouter: ${modelName}`);
    const openrouter = createOpenAI({
      apiKey: openrouterKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return openrouter.chat(modelName);
  }
  if (googleKey) {
    devLog.info("llm", "Navigator using Google Gemini: gemini-2.0-flash");
    return google("gemini-2.0-flash");
  }
  throw new Error("No LLM API key configured.");
}

const NAVIGATOR_SYSTEM = `You are the Navigator agent for Gideon, a voice-controlled web browser for BLIND users. You are the user's eyes — you MUST describe what you see after every significant page change.

## Your Tools
1. **goto_url** — Navigate to a URL
2. **do_action** — Perform ONE simple action (click, type, scroll, press Enter, etc.)
3. **extract_info** — Read/extract specific information from the current page
4. **narrate** — Describe what the page looks like to the user (REQUIRED after every page load and significant action)
5. **ask_user** — Ask the user a clarifying question when you're genuinely uncertain
6. **done** — Signal task completion with a summary

## NARRATION RULES (CRITICAL)
You are the user's EYES. After every goto_url and after any do_action that changes the page significantly, you MUST call narrate to describe:
- What type of page this is (search results, product page, article, form, homepage, etc.)
- The spatial layout: what's at the top, middle, bottom
- Key interactive elements: search bars, buttons, links, forms
- The main content: product names/prices, article text, search results
- Any obstacles: cookie popups, login walls, captchas, newsletter modals

Narration style:
- Use natural, spatial language: "At the top there's a search bar. Below that, I can see a grid of products..."
- Be concise but informative — 2-4 sentences
- Focus on what matters for the user's task
- Mention prices, ratings, and key details when on shopping pages

## COMMON WEB PATTERNS (Handle Automatically)
- **Cookie/consent popups**: Dismiss them immediately (click Accept/Agree/Close), then narrate the actual page
- **Newsletter/signup modals**: Close them (click X or dismiss button), then continue
- **Login walls**: Tell the user "This page requires login. Would you like me to try to sign in?" via ask_user
- **Captchas**: Narrate that there's a captcha and explain you cannot solve it
- **Age verification**: Ask the user before confirming age gates

## CLARIFICATION (ask_user)
Use ask_user ONLY when genuinely ambiguous:
- Multiple items match and you can't tell which the user wants
- The page requires a choice (size, color, quantity)
- Login is required and you need permission
- Do NOT ask for confirmation on routine navigation steps

## CRITICAL RULES
- You MUST complete the ENTIRE task. Do NOT stop after just navigating to a website.
- Break every task into simple, atomic steps. NEVER combine multiple actions in one do_action call.
- ALWAYS start by navigating to the right website with goto_url.
- After goto_url, you receive page context. Use this to decide next action, then NARRATE what you see.
- For searching: goto_url, then do_action("click the search box"), do_action("type 'query'"), do_action("press Enter"), then NARRATE the results.
- When you have the answer or task is done, call done with a natural summary.
- If an action fails, try an alternative approach.
- NEVER call done until you have actually completed the task.
- If a tool result contains "LOOP DETECTED" or "ABORTED", call done immediately.

## SITE-SPECIFIC PATTERNS

YouTube — Creator videos:
1. goto_url("https://www.youtube.com/@{username}/videos")
2. narrate the video list
3. extract_info("List the most recent videos with titles and upload dates")
4. done(summary)

YouTube — Search:
1. goto_url("https://www.youtube.com")
2. do_action("click the search box"), type, press Enter
3. narrate the search results

Amazon — Shopping:
1. goto_url("https://www.amazon.com")
2. Search via the search box
3. narrate the product results with prices and ratings

Amazon — Account:
1. goto_url("https://www.amazon.com/gp/css/homepage.html")
2. narrate what account options are visible

Google — Search:
1. goto_url("https://www.google.com/search?q={query}")
2. narrate the search results

Target/Walmart — Shopping:
1. goto_url("https://www.{site}.com")
2. Search via search input
3. narrate the product results with prices`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPageContext(page: any) {
  const url = page.url();
  const title = await page.title().catch(() => "");

  const structured = await page
    .evaluate(() => {
      const text = (document.body.innerText || "").substring(0, 2500);

      // Extract headings
      const headings: string[] = [];
      document.querySelectorAll("h1, h2, h3").forEach((el, i) => {
        if (i < 10 && el.textContent?.trim()) {
          headings.push(`${el.tagName}: ${el.textContent.trim().substring(0, 100)}`);
        }
      });

      // Extract buttons/CTAs
      const buttons: string[] = [];
      document.querySelectorAll("button, [role='button'], input[type='submit']").forEach((el, i) => {
        if (i < 10) {
          const label = (el as HTMLElement).textContent?.trim() || (el as HTMLInputElement).value || "";
          if (label) buttons.push(label.substring(0, 60));
        }
      });

      // Extract form fields
      const fields: string[] = [];
      document.querySelectorAll("input, select, textarea").forEach((el, i) => {
        if (i < 10) {
          const inp = el as HTMLInputElement;
          const label = inp.getAttribute("aria-label") || inp.placeholder || inp.name || inp.type;
          if (label && inp.type !== "hidden") fields.push(`${inp.type || "text"}: ${label}`);
        }
      });

      // Extract nav links
      const navLinks: string[] = [];
      document.querySelectorAll("nav a, header a").forEach((el, i) => {
        if (i < 8 && el.textContent?.trim()) {
          navLinks.push(el.textContent.trim().substring(0, 40));
        }
      });

      // Page signals
      const hasSearchBox = !!document.querySelector("input[type='search'], input[name='q'], input[aria-label*='search' i], input[placeholder*='search' i]");
      const hasLoginForm = !!document.querySelector("input[type='password'], form[action*='login'], form[action*='signin']");
      const hasCart = !!document.querySelector("[class*='cart' i], [id*='cart' i], [aria-label*='cart' i]");
      const hasCookieBanner = !!document.querySelector("[class*='cookie' i], [class*='consent' i], [id*='cookie' i], [id*='consent' i]");

      return {
        pageContent: text,
        headings,
        buttons,
        fields,
        navLinks,
        signals: { hasSearchBox, hasLoginForm, hasCart, hasCookieBanner },
      };
    })
    .catch(() => ({
      pageContent: "",
      headings: [] as string[],
      buttons: [] as string[],
      fields: [] as string[],
      navLinks: [] as string[],
      signals: { hasSearchBox: false, hasLoginForm: false, hasCart: false, hasCookieBanner: false },
    }));

  const ctx: Record<string, unknown> = {
    currentUrl: url,
    pageTitle: title,
    pageContent: structured.pageContent,
    headings: structured.headings,
    buttons: structured.buttons,
    formFields: structured.fields,
    navLinks: structured.navLinks,
    pageSignals: structured.signals,
  };

  devLog.debug("navigator", `Page context: ${url} "${title}" (${String(structured.pageContent).length} chars text)`);
  return ctx;
}

export async function navigatorAgent(
  instruction: string,
  sendThought: SendThoughtFn
): Promise<AgentResult> {
  devLog.info("navigator", `========== START: "${instruction}" ==========`);
  sendThought("Navigator", `Task: "${instruction}"`);

  let stepNumber = 0;
  const actionHistory: Map<string, number> = new Map();
  const MAX_REPEATS = 2;

  function checkLoop(toolName: string, args: string): string | null {
    const key = `${toolName}:${args}`;
    const count = (actionHistory.get(key) || 0) + 1;
    actionHistory.set(key, count);
    if (count > MAX_REPEATS) {
      devLog.warn("navigator", `LOOP DETECTED: "${key}" repeated ${count} times`);
      return `LOOP DETECTED: This exact action ("${args}") has already been tried ${count - 1} times. You MUST call done now.`;
    }
    return null;
  }

  function checkAbort(): string | null {
    if (isAborted()) {
      devLog.info("navigator", "ABORTED by user");
      return "ABORTED: The user has cancelled this task. Call done immediately.";
    }
    return null;
  }

  try {
    const stagehand = await getStagehand();
    const page = stagehand.context.activePage();
    if (!page) throw new Error("No active page available");

    const startUrl = page.url();
    setLastUrl(startUrl);
    devLog.info("navigator", `Active page: ${startUrl}`);
    const startCtx = await getPageContext(page);

    const learnedFlows = getLearnedFlows();
    const learnedContext = learnedFlows.length > 0
      ? `\n\nLEARNED PATTERNS FROM PAST SESSIONS:\n${learnedFlows.map((f) => `- "${f.pattern}": ${f.steps}`).join("\n")}`
      : "";

    let finalMessage = "";

    const navigatorPrompt = `Current URL: ${startCtx.currentUrl}\nPage title: ${startCtx.pageTitle || "(blank)"}\nPage signals: ${JSON.stringify(startCtx.pageSignals)}${learnedContext}\n\nTask: ${instruction}`;

    sendThought("Navigator", `Analyzing task and planning navigation steps...`);
    sendThought("Navigator → Orchestrator", `Received task. Will navigate to complete: "${instruction}"`);

    devLog.info("llm", "Navigator generateText call", {
      prompt: navigatorPrompt,
      maxSteps: 12,
    });

    const navDone = devLog.time("llm", "Navigator full generateText loop");

    const { text, steps } = await generateText({
      model: getModel(),
      system: NAVIGATOR_SYSTEM,
      prompt: navigatorPrompt,
      stopWhen: stepCountIs(12),
      tools: {
        goto_url: tool({
          description: "Navigate the browser to a URL.",
          inputSchema: z.object({
            url: z.string().describe("The URL to navigate to"),
          }),
          execute: async ({ url }) => {
            const abortMsg = checkAbort();
            if (abortMsg) return { error: abortMsg };

            stepNumber++;
            let fullUrl = url;
            if (!fullUrl.startsWith("http")) fullUrl = `https://${fullUrl}`;

            const loopMsg = checkLoop("goto_url", fullUrl);
            if (loopMsg) {
              sendThought("Navigator", "Loop detected — stopping repeated navigation");
              return { error: loopMsg, currentUrl: page.url(), pageTitle: await page.title().catch(() => "") };
            }

            devLog.info("navigation", `[Step ${stepNumber}] goto_url: ${fullUrl}`);
            sendThought("Navigator", `Step ${stepNumber}: Opening ${fullUrl}`);

            // Track URL for go-back support
            setLastUrl(page.url());

            const navTimer = devLog.time("navigation", `page.goto(${fullUrl})`);
            try {
              await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeoutMs: 15000 });
              navTimer({ success: true, url: fullUrl });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              navTimer({ success: false, error: msg }, "warn");
              sendThought("Navigator", "Page load slow, continuing anyway");
            }

            await page.waitForTimeout(2000);
            await captureScreenshot(page);

            const pageTitle = await page.title().catch(() => fullUrl);
            sendThought("Navigator", `Page loaded: "${pageTitle}"`);

            const ctx = await getPageContext(page);
            devLog.info("navigator", `[Step ${stepNumber}] goto_url complete`, {
              finalUrl: ctx.currentUrl,
              pageTitle: ctx.pageTitle,
            });
            return ctx;
          },
        }),

        do_action: tool({
          description:
            "Perform ONE simple action on the current page. Be very specific. Good: 'click the search box', 'type protein in the search field', 'press Enter'. Bad: 'search for protein and click the first result' (too many actions).",
          inputSchema: z.object({
            action: z.string().describe("A single, specific action"),
          }),
          execute: async ({ action }) => {
            const abortMsg = checkAbort();
            if (abortMsg) return { error: abortMsg };

            stepNumber++;

            const loopMsg = checkLoop("do_action", action);
            if (loopMsg) {
              sendThought("Navigator", "Loop detected — stopping repeated action");
              return { error: loopMsg, currentUrl: page.url(), pageTitle: await page.title().catch(() => "") };
            }

            devLog.info("navigator", `[Step ${stepNumber}] do_action: "${action}"`);
            sendThought("Navigator", `Step ${stepNumber}: "${action}"`);

            const actTimer = devLog.time("stagehand", `act("${action}")  [via navigator tool]`);
            try {
              await stagehand.act(action);
              actTimer({ success: true });
              sendThought("Navigator", `Done: "${action}"`);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              actTimer({ success: false, error: msg }, "error");
              devLog.error("navigator", `[Step ${stepNumber}] Action FAILED: "${action}"`, { error: msg });
              sendThought("Navigator → Orchestrator", `Action failed: "${action}" — ${msg}. Trying alternative...`);
              await captureScreenshot(page);
              const errCtx = await getPageContext(page);
              return { ...errCtx, error: msg };
            }

            await page.waitForTimeout(2000);
            await captureScreenshot(page);

            const ctx = await getPageContext(page);
            devLog.info("navigator", `[Step ${stepNumber}] do_action complete`, {
              currentUrl: ctx.currentUrl,
              pageTitle: ctx.pageTitle,
            });
            return ctx;
          },
        }),

        extract_info: tool({
          description:
            "Extract specific information visible on the current page. Use for reading text, prices, descriptions, etc.",
          inputSchema: z.object({
            instruction: z.string().describe("What information to extract from the page"),
          }),
          execute: async ({ instruction: extractInstruction }) => {
            const abortMsg = checkAbort();
            if (abortMsg) return { error: abortMsg };

            stepNumber++;

            const loopMsg = checkLoop("extract_info", extractInstruction);
            if (loopMsg) {
              sendThought("Navigator", "Loop detected — stopping repeated extraction");
              return { error: loopMsg };
            }

            devLog.info("navigator", `[Step ${stepNumber}] extract_info: "${extractInstruction}"`);
            sendThought("Navigator", `Step ${stepNumber}: Reading page — "${extractInstruction}"`);

            try {
              const extractTimer = devLog.time("stagehand", `extract("${extractInstruction}")`);
              const result = await stagehand.extract(extractInstruction);
              extractTimer({
                success: true,
                resultPreview: JSON.stringify(result).substring(0, 500),
              });
              sendThought("Navigator", "Extracted page info successfully");
              sendThought("Navigator → Orchestrator", `Found data: ${JSON.stringify(result).substring(0, 200)}`);
              await captureScreenshot(page);
              return result;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              devLog.warn("navigator", `extract failed, falling back to innerText`, { error: msg });
              sendThought("Navigator", "Extract failed, reading page text directly");
              const fallbackText = await page
                .evaluate(() => document.body.innerText.substring(0, 3000))
                .catch(() => "Could not read page text");
              await captureScreenshot(page);
              return { pageText: fallbackText };
            }
          },
        }),

        narrate: tool({
          description:
            "Describe the current page to the blind user. Call this after every goto_url and after significant do_action changes. Describe the page layout, key elements, and content spatially.",
          inputSchema: z.object({
            description: z.string().describe("A natural, spatial description of what the page looks like — 2-4 sentences covering layout, key elements, and relevant content"),
          }),
          execute: async ({ description }) => {
            stepNumber++;
            devLog.info("navigator", `[Step ${stepNumber}] narrate: "${description.substring(0, 200)}"`);
            sendThought("Narrator", description);
            return { narrated: true };
          },
        }),

        ask_user: tool({
          description:
            "Ask the user a clarifying question when genuinely ambiguous. Use sparingly — only when multiple options match or a choice is required.",
          inputSchema: z.object({
            question: z.string().describe("The question to ask the user"),
            options: z.array(z.string()).optional().describe("Optional list of choices"),
          }),
          execute: async ({ question, options }) => {
            const abortMsg = checkAbort();
            if (abortMsg) return { error: abortMsg };

            stepNumber++;
            devLog.info("navigator", `[Step ${stepNumber}] ask_user: "${question}"`);
            sendThought("Narrator", `Question: ${question}`);

            const answer = await askQuestion(question, options);
            devLog.info("navigator", `[Step ${stepNumber}] User answered: "${answer}"`);
            sendThought("Navigator", `User responded: "${answer}"`);

            return { userAnswer: answer };
          },
        }),

        done: tool({
          description:
            "Call when the task is fully complete. Provide a natural summary of what you found or did.",
          inputSchema: z.object({
            summary: z.string().describe("Concise summary of results for the user"),
          }),
          execute: async ({ summary }) => {
            stepNumber++;
            devLog.info("navigator", `[Step ${stepNumber}] done: "${summary.substring(0, 200)}"`);
            sendThought("Navigator", "Task complete");
            sendThought("Navigator → Orchestrator", `Finished in ${stepNumber} steps. Result: ${summary.substring(0, 150)}`);
            finalMessage = summary;
            await captureScreenshot(page);
            return { done: true };
          },
        }),
      },
    });

    navDone({
      totalSteps: stepNumber,
      llmSteps: steps?.length ?? 0,
      finalUrl: page.url(),
    });

    const message = finalMessage || text || `Completed. Currently on: ${page.url()}`;
    devLog.info("navigator", `========== DONE (${stepNumber} steps) ==========`, {
      message: message.substring(0, 300),
    });
    return { success: true, message };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    devLog.error("navigator", `Navigator failed: ${errorMsg}`);
    sendThought("Navigator", `Error: ${errorMsg}`);
    sendThought("Navigator → Orchestrator", `Navigation failed: ${errorMsg}`);

    // Try a simple direct navigation as last resort
    try {
      const stagehand = await getStagehand();
      const page = stagehand.context.activePage();
      if (page) {
        const url = buildSearchUrl(instruction);
        devLog.warn("navigator", `Fallback: direct navigation to ${url}`);
        sendThought("Navigator", `Fallback: loading ${url}`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeoutMs: 15000 });
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

  const urlMatch = trimmed.match(
    /\b(https?:\/\/[^\s]+|(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)\b/i
  );
  if (urlMatch) {
    const candidate = urlMatch[1];
    return candidate.startsWith("http") ? candidate : `https://${candidate}`;
  }

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
