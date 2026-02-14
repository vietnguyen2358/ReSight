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

const NAVIGATOR_SYSTEM = `You are the Navigator for ReSite, a voice-controlled web browser for BLIND users. You are their eyes — browsing the web on their behalf, narrating everything clearly so they always know what's happening. Think of yourself as a knowledgeable friend sitting next to them.

## Your Personality
- Speak naturally and conversationally: "Alright, let me look that up for you..." not "Executing search query"
- Be warm, clear, and confident — the user trusts you to handle things
- ALWAYS tell the user what you're doing: "I'm clicking the search box now...", "The results are loading...", "I can see a few options here..."
- NEVER leave the user in silence. They can't see the screen — you ARE their eyes.
- Focus on what MATTERS to the user's task, not UI chrome. Never mention buttons, sign-up links, cart icons, or page layout unless directly relevant to what the user asked.
- Think about what a helpful friend would ACTUALLY say. A friend wouldn't say "I can see a Sign up button and the cart has 0 items." A friend would say "They've got a nice menu here — what kind of drink are you in the mood for?"

## Your Tools
1. **goto_url** — Navigate to a URL
2. **do_action** — Perform ONE simple action (click, type, scroll, press Enter, etc.)
3. **extract_info** — Read/extract specific information from the current page
4. **narrate** — Describe what you see to the user (REQUIRED after every page load and significant action)
5. **ask_user** — Ask the user a clarifying question when genuinely ambiguous
6. **done** — Signal task completion with a conversational summary

## NARRATION RULES (CRITICAL — YOU MUST FOLLOW THESE)
After every goto_url and after any do_action that changes the page, you MUST call narrate.

Use ADAPTIVE DETAIL:
- **Simple state** (single clear answer, basic confirmation): 2-3 sentences
- **Complex state** (many options/results, tradeoffs, forms, multiple prices): 4-6 sentences

Structure every narration in this order:
1. **Context**: where we are or what changed
2. **Key facts**: names, prices, ratings, counts, availability, notable constraints
3. **Minimal orientation hint** ONLY when action-relevant (for example, where search results or filters are)
4. **Actionable next step**: offer 2-3 concrete options so the user stays in control

Keep it natural, spoken, and specific. Prefer concrete facts over generic summaries.
Do NOT describe decorative UI chrome (sign-up prompts, cart icons, generic nav) unless directly relevant to the task.

## ANSWERING STRATEGY (CRITICAL — READ THIS CAREFULLY)
Your goal is to answer the user's question QUICKLY and CONVERSATIONALLY. Do NOT be exhaustive.

**Give highlights, not data dumps:**
- When asked about prices/menus: give the price RANGE and 3-5 popular items, NOT every item on the menu
- When asked about products: give the top 2-3 options with prices and ratings, NOT every search result
- When asked about a place: give the key facts (rating, address, hours, what it's known for), NOT a full directory listing

**Be quick to finish:**
- Once you have enough information to answer the question, call done IMMEDIATELY
- Do NOT keep clicking through pages, scrolling, or exploring after you have a good answer
- A "good answer" = you can tell the user what they asked about with specific details (name, price, rating, etc.)
- If you found the answer on Google search results or the first page, that's enough — don't navigate deeper

**Offer to go deeper instead of going deeper unprompted:**
- After summarizing, invite the user: "Want me to look at any of these in more detail?" or "I can check the full menu if you'd like"
- Let the USER decide if they want more detail — don't assume they do
- This makes the user feel in control without burdening them with decisions on every step

**Examples of GOOD vs BAD answers:**
- BAD: "The page shows their store with a 4.8-star rating. I can see menu categories on the left including Featured Items, Most Ordered, Matcha. There's a Sign up button at the top and the cart has 0 items."
- GOOD: "Nice, Molly Tea is open and ready to order! They've got milk teas, matcha drinks, and some fancy snowy whipped cream specials. Most drinks are around $7 to $9. What kind of drink are you in the mood for?"
- BAD: "Here are all 47 items on the menu with prices: [massive list]"
- GOOD: "Their most popular drinks are the Fresh Milk Teas around $7-8 — things like Jasmine, Oolong, and Peach Oolong. They also have some unique Snowy Whipped Cream drinks around $8-9. Want me to read you a specific section?"
- BAD: "I found 15 protein powder options. Here they all are: [long list]"
- GOOD: "I found a few solid options. The top-rated one is Optimum Nutrition Gold Standard at $32 with 4.7 stars. There's also Dymatize ISO100 at $28. Want me to compare more or look at one of these?"

## COMMON WEB PATTERNS (Handle Automatically)
- **Cookie/consent popups**: Dismiss them immediately, then say "I dismissed a cookie popup, now I can see the actual page..."
- **Newsletter/signup modals**: Close them, say "There was a signup popup, I closed it..."
- **Login walls**: Ask the user via ask_user: "This page needs you to be logged in. Want me to try signing in?"
- **Captchas**: Tell the user: "There's a captcha here that I can't solve, unfortunately."
- **Access denied / bot blocks**: If a goto_url result contains "blocked":true or the page title says "Access Denied" or similar, do NOT retry the same site or domain. Immediately fall back to Google search.

## BLOCKED SITES (NEVER visit these — they always block us)
- yelp.com — always triggers CAPTCHA. Use Google search or an alternative site instead.

## BOT BLOCK FALLBACK (CRITICAL)
Many sites block automated browsers. When you get blocked (page title says "Access Denied", "Just a moment", "Forbidden", or the tool result has "blocked":true):
1. Do NOT retry the same site — it will fail again
2. Do NOT try a different URL on the same domain — also blocked
3. Use Google search instead: goto_url("https://www.google.com/search?q={what the user wanted}")
4. Extract info from Google results — snippets often have prices, descriptions, summaries
5. If Google isn't enough, try an alternative unblocked site (e.g., Zillow blocked → try Realtor.com or Craigslist)

## CLARIFICATION (ask_user)
Only when genuinely ambiguous:
- Multiple items match: "I see three different protein powders — did you want the Optimum Nutrition one, the Dymatize, or the Garden of Life?"
- Choice needed: "What size do you want?"
- Don't ask about routine steps — just do them.

## RULES
- Complete the task efficiently. Going to a website is just the first step — but don't over-explore.
- One action at a time. Never combine actions.
- Start with goto_url, then narrate what you see, then continue.
- If something fails, try a different approach and let the user know.
- NEVER call done until you have a real answer to the user's question.
- Call done AS SOON AS you have enough info. Don't keep browsing "just in case."
- If you see "LOOP DETECTED", "STEP LIMIT REACHED", "TOO MANY FAILURES", "STALE PAGE", or "ABORTED" in a tool result, you MUST call done IMMEDIATELY. Do not try more actions. Summarize what you found so far.
- Your done summary should be conversational — like telling a friend what you found.
- ALWAYS end your done summary with a clear, actionable next step based on the page content. Guide the user forward:
  - On a menu: "What kind of drink sounds good to you?" or "Want me to order one of these?"
  - On search results: "Want me to check out any of these?" or "Should I go with the top one?"
  - On a product page: "Want me to add this to cart?" or "Should I look for a different option?"
- NEVER end with a generic "Want me to look into this?" — be SPECIFIC about what you can do next based on what's actually on the page.

## SITE-SPECIFIC PATTERNS

YouTube — Creator videos:
1. goto_url("https://www.youtube.com/@{username}/videos") — go directly to their videos tab
2. narrate what you see
3. extract_info("List the most recent videos with titles and upload dates")
4. done with a conversational summary

YouTube — Search:
1. goto_url("https://www.youtube.com")
2. Search via the search box
3. narrate the search results

Amazon / Target / Walmart — Shopping:
1. goto_url to the site
2. Search via the search box
3. narrate the top 2-3 products with prices and ratings — don't list everything

Google — Search:
1. goto_url("https://www.google.com/search?q={query}") — use URL params directly
2. narrate the top results
3. If the Google snippet already answers the question, call done — don't click through`;

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

      // Extract prices
      const prices: string[] = [];
      const priceRegex = /(?:[$€£]\s?\d[\d,]*(?:\.\d{1,2})?)|(?:\d[\d,]*(?:\.\d{1,2})?\s?(?:usd|eur|gbp))/gi;
      document.querySelectorAll("body *").forEach((el, i) => {
        if (i >= 350) return;
        const textContent = el.textContent?.trim();
        if (!textContent || textContent.length > 120) return;
        const matches = textContent.match(priceRegex);
        if (!matches) return;
        for (const match of matches) {
          if (prices.length >= 12) break;
          const normalized = match.replace(/\s+/g, " ").trim();
          if (!prices.includes(normalized)) prices.push(normalized);
        }
      });

      // Extract ratings
      const ratings: string[] = [];
      const ratingRegex = /(?:\b\d(?:\.\d)?\s*\/\s*5\b)|(?:\b\d(?:\.\d)?\s*stars?\b)|(?:\b\d(?:\.\d)?\s*out of\s*5\b)/gi;
      document.querySelectorAll("body *").forEach((el, i) => {
        if (i >= 350 || ratings.length >= 10) return;
        const textContent = el.textContent?.trim();
        if (!textContent || textContent.length > 120) return;
        const matches = textContent.match(ratingRegex);
        if (!matches) return;
        for (const match of matches) {
          if (ratings.length >= 10) break;
          const normalized = match.replace(/\s+/g, " ").trim();
          if (!ratings.includes(normalized)) ratings.push(normalized);
        }
      });

      // Extract likely result/item names
      const itemNames: string[] = [];
      document.querySelectorAll("h1, h2, h3, h4, [role='heading'], article a, li a").forEach((el, i) => {
        if (i >= 120 || itemNames.length >= 12) return;
        const textContent = el.textContent?.trim();
        if (!textContent) return;
        const cleaned = textContent.replace(/\s+/g, " ").trim();
        if (cleaned.length < 3 || cleaned.length > 90) return;
        if (!itemNames.includes(cleaned)) itemNames.push(cleaned);
      });

      // Extract concise page snippets
      const snippets: string[] = [];
      document.querySelectorAll("main p, article p, section p, [role='main'] p").forEach((el, i) => {
        if (i >= 30 || snippets.length >= 6) return;
        const textContent = el.textContent?.trim();
        if (!textContent) return;
        const cleaned = textContent.replace(/\s+/g, " ").trim();
        if (cleaned.length < 40) return;
        snippets.push(cleaned.substring(0, 140));
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
        prices,
        ratings,
        itemNames,
        snippets,
        counts: {
          headings: headings.length,
          buttons: buttons.length,
          fields: fields.length,
          navLinks: navLinks.length,
          prices: prices.length,
          ratings: ratings.length,
          itemNames: itemNames.length,
          snippets: snippets.length,
        },
        signals: { hasSearchBox, hasLoginForm, hasCart, hasCookieBanner },
      };
    })
    .catch(() => ({
      pageContent: "",
      headings: [] as string[],
      buttons: [] as string[],
      fields: [] as string[],
      navLinks: [] as string[],
      prices: [] as string[],
      ratings: [] as string[],
      itemNames: [] as string[],
      snippets: [] as string[],
      counts: {
        headings: 0,
        buttons: 0,
        fields: 0,
        navLinks: 0,
        prices: 0,
        ratings: 0,
        itemNames: 0,
        snippets: 0,
      },
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
    prices: structured.prices,
    ratings: structured.ratings,
    itemNames: structured.itemNames,
    snippets: structured.snippets,
    counts: structured.counts,
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

  let stepNumber = 0;
  let consecutiveFailures = 0;
  let substantiveNarrations = 0;
  const actionHistory: Map<string, number> = new Map();
  const urlHistory: string[] = [];
  const contentHashes: string[] = [];
  let staleCount = 0;
  const MAX_REPEATS = 5;
  const MAX_CONSECUTIVE_FAILURES = 6;
  const MAX_STALE_PAGES = 6;
  const HARD_STEP_LIMIT = 30;

  // ── Force-stop mechanism ──
  // AbortController kills the generateText loop at the code level.
  // When any loop/abort condition fires, we set forceStopReason AND
  // call controller.abort() so the LLM cannot make another call.
  const controller = new AbortController();
  let forceStopReason = "";

  function forceStop(reason: string) {
    if (forceStopReason) return; // already stopping
    devLog.warn("navigator", `FORCE STOP: ${reason}`);
    // Send wrap-up message BEFORE setting flag so it passes the sendThought guard
    if (reason !== "Cancelled by user") {
      sendThought("Narrator", "Let me wrap up and tell you what I found.", "thinking");
    }
    forceStopReason = reason;
    try { controller.abort(); } catch { /* ignore */ }
  }

  function quickHash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return String(h);
  }

  function checkLoop(toolName: string, args: string): string | null {
    const key = `${toolName}:${args}`;
    const count = (actionHistory.get(key) || 0) + 1;
    actionHistory.set(key, count);
    if (count > MAX_REPEATS) {
      forceStop(`Loop: action "${args}" repeated ${count} times`);
      return forceStopReason;
    }
    if (stepNumber >= HARD_STEP_LIMIT) {
      forceStop(`Step limit: used ${stepNumber}/${HARD_STEP_LIMIT} steps`);
      return forceStopReason;
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      forceStop(`${consecutiveFailures} consecutive failures`);
      return forceStopReason;
    }
    return null;
  }

  function trackUrl(url: string): string | null {
    urlHistory.push(url);
    if (urlHistory.length >= 4) {
      const last4 = urlHistory.slice(-4);
      if (last4[0] === last4[2] && last4[1] === last4[3] && last4[0] !== last4[1]) {
        forceStop(`URL oscillation between ${last4[0]} and ${last4[1]}`);
        return forceStopReason;
      }
    }
    return null;
  }

  function trackContent(content: string): string | null {
    const hash = quickHash(content);
    contentHashes.push(hash);
    if (contentHashes.length >= 3) {
      const last3 = contentHashes.slice(-3);
      if (last3[0] === last3[1] && last3[1] === last3[2]) {
        staleCount++;
        if (staleCount >= MAX_STALE_PAGES) {
          forceStop(`Page unchanged after ${staleCount} actions`);
          return forceStopReason;
        }
      } else {
        staleCount = 0;
      }
    }
    return null;
  }

  function checkAbort(): string | null {
    if (isAborted()) {
      forceStop("Cancelled by user");
      return forceStopReason;
    }
    return null;
  }

  function detectBotBlock(pageContent: string, pageTitle: string): string | null {
    const content = pageContent.toLowerCase();
    const title = pageTitle.toLowerCase();
    if (content.includes("checking your browser") || content.includes("checking if the site connection is secure")) return "Cloudflare challenge";
    if (title.includes("just a moment") && content.includes("ray id")) return "Cloudflare challenge";
    if (title.includes("attention required") && content.includes("cloudflare")) return "Cloudflare block";
    if (content.includes("verify you are human") || content.includes("are you a robot")) return "CAPTCHA";
    if (content.includes("please enable javascript and cookies") || content.includes("please turn javascript on")) return "JavaScript/cookie wall";
    if (content.includes("pardon our interruption")) return "Bot detection (retail)";
    if (title === "access denied" || title.includes("access denied") || (title.includes("403") && content.length < 500)) return "Access denied";
    if (title.includes("access to this page has been denied")) return "Access denied";
    if (content.includes("automated access") || content.includes("bot detected")) return "Bot detection";
    return null;
  }

  let finalMessage = "";
  const narratorMessages: string[] = [];
  const originalSendThought: SendThoughtFn = sendThought;
  // Intercept narrator thoughts so we can build a fallback summary
  // and suppress any thoughts after force-stop (tools may still run briefly after abort)
  sendThought = (agent: string, message: string, type?: "thinking" | "answer") => {
    if (forceStopReason) return; // suppress all thoughts after force-stop
    if (agent === "Narrator") narratorMessages.push(message);
    originalSendThought(agent, message, type);
  };

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

    const factHints: string[] = [];
    const startPrices = Array.isArray(startCtx.prices) ? (startCtx.prices as string[]) : [];
    const startRatings = Array.isArray(startCtx.ratings) ? (startCtx.ratings as string[]) : [];
    const startItems = Array.isArray(startCtx.itemNames) ? (startCtx.itemNames as string[]) : [];
    const startSnippets = Array.isArray(startCtx.snippets) ? (startCtx.snippets as string[]) : [];

    if (startPrices.length > 0) factHints.push(`prices: ${startPrices.slice(0, 5).join(", ")}`);
    if (startRatings.length > 0) factHints.push(`ratings: ${startRatings.slice(0, 3).join(", ")}`);
    if (startItems.length > 0) factHints.push(`items: ${startItems.slice(0, 5).join(" | ")}`);
    if (startSnippets.length > 0) factHints.push(`snippets: ${startSnippets.slice(0, 2).join(" || ")}`);

    const factsBlock = factHints.length
      ? `\nAvailable facts: ${factHints.join(" ; ")}\nUse concrete facts when narrating.`
      : "";

    const navigatorPrompt = `Current URL: ${startCtx.currentUrl}\nPage title: ${startCtx.pageTitle || "(blank)"}\nPage signals: ${JSON.stringify(startCtx.pageSignals)}${factsBlock}${learnedContext}\n\nTask: ${instruction}`;


    devLog.info("llm", "Navigator generateText call", {
      prompt: navigatorPrompt,
      maxSteps: 12,
    });

    const navDone = devLog.time("llm", "Navigator full generateText loop");

    const { text, steps } = await generateText({
      model: getModel(),
      system: NAVIGATOR_SYSTEM,
      prompt: navigatorPrompt,
      stopWhen: stepCountIs(30),
      abortSignal: controller.signal,
      tools: {
        goto_url: tool({
          description: "Navigate the browser to a URL.",
          inputSchema: z.object({
            url: z.string().describe("The URL to navigate to"),
          }),
          execute: async ({ url }) => {
            if (forceStopReason) return { error: forceStopReason, forceStopped: true };
            const abortMsg = checkAbort();
            if (abortMsg) return { error: abortMsg };

            stepNumber++;
            let fullUrl = url;
            if (!fullUrl.startsWith("http")) fullUrl = `https://${fullUrl}`;

            // Hard-block sites that always trigger CAPTCHAs
            const BLOCKED_DOMAINS = ["yelp.com"];
            try {
              const hostname = new URL(fullUrl).hostname.replace("www.", "");
              if (BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
                sendThought("Narrator", `That site blocks automated browsers. Let me try a different approach...`, "thinking");
                return {
                  blocked: true,
                  blockType: "Known CAPTCHA site",
                  suggestion: `${hostname} always blocks automated browsers. Use Google search instead: goto_url("https://www.google.com/search?q=${encodeURIComponent(instruction)}")`,
                };
              }
            } catch { /* ignore URL parse errors */ }

            const loopMsg = checkLoop("goto_url", fullUrl);
            if (loopMsg) return { error: loopMsg, currentUrl: page.url(), pageTitle: await page.title().catch(() => "") };

            devLog.info("navigation", `[Step ${stepNumber}] goto_url: ${fullUrl}`);
            // Build a descriptive navigation message
            const parsedUrl = new URL(fullUrl);
            const siteName = parsedUrl.hostname.replace("www.", "");
            const searchQuery = parsedUrl.searchParams.get("q") || parsedUrl.searchParams.get("query") || parsedUrl.searchParams.get("searchTerm") || parsedUrl.searchParams.get("k");
            const navMessage = searchQuery
              ? `Searching ${siteName.replace("google.com", "Google").replace("bing.com", "Bing")} for "${searchQuery}"...`
              : `Opening ${siteName}...`;
            sendThought("Narrator", navMessage, "thinking");

            // Track URL for go-back support
            setLastUrl(page.url());

            const navTimer = devLog.time("navigation", `page.goto(${fullUrl})`);
            try {
              await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeoutMs: 15000 });
              navTimer({ success: true, url: fullUrl });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              navTimer({ success: false, error: msg }, "warn");
              sendThought("Narrator", "The page is loading a bit slowly, but I'll keep going...", "thinking");
            }

            // Wait longer to give Browserbase captcha solver time to work
            await page.waitForTimeout(6000);
            await captureScreenshot(page);

            const pageTitle = await page.title().catch(() => fullUrl);

            const ctx = await getPageContext(page);
            consecutiveFailures = 0;

            // Detect bot blocks and signal the LLM to use Google fallback
            const blockType = detectBotBlock(String(ctx.pageContent || ""), String(ctx.pageTitle || ""));
            if (blockType) {
              devLog.warn("navigator", `Bot block detected: ${blockType} on ${fullUrl}`);
              sendThought("Narrator", `That site is blocking me. Let me try a different approach...`, "thinking");
              return {
                ...ctx,
                blocked: true,
                blockType,
                suggestion: `This site blocked automated access (${blockType}). Use Google search instead: goto_url("https://www.google.com/search?q=${encodeURIComponent(instruction)}")`,
              };
            }

            // Track URL and content for loop detection
            const urlLoop = trackUrl(String(ctx.currentUrl));
            if (urlLoop) return { ...ctx, error: urlLoop };
            const contentLoop = trackContent(String(ctx.pageContent || ""));
            if (contentLoop) return { ...ctx, error: contentLoop };

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
            if (forceStopReason) return { error: forceStopReason, forceStopped: true };
            const abortMsg = checkAbort();
            if (abortMsg) return { error: abortMsg };

            stepNumber++;

            const loopMsg = checkLoop("do_action", action);
            if (loopMsg) return { error: loopMsg, currentUrl: page.url(), pageTitle: await page.title().catch(() => "") };

            devLog.info("navigator", `[Step ${stepNumber}] do_action: "${action}"`);
            // Make action descriptions conversational
            const friendlyAction = action.toLowerCase().startsWith("click")
              ? `Clicking on ${action.replace(/^click\s+(the\s+|on\s+)?/i, "")}...`
              : action.toLowerCase().startsWith("type")
                ? `Typing ${action.replace(/^type\s+/i, "")}...`
                : action.toLowerCase().startsWith("scroll")
                  ? "Scrolling down the page..."
                  : action.toLowerCase().startsWith("press")
                    ? `Pressing ${action.replace(/^press\s+/i, "")}...`
                    : `${action}...`;
            sendThought("Narrator", friendlyAction, "thinking");

            const actTimer = devLog.time("stagehand", `act("${action}")  [via navigator tool]`);
            try {
              await stagehand.act(action);
              actTimer({ success: true });
              consecutiveFailures = 0;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              actTimer({ success: false, error: msg }, "error");
              devLog.error("navigator", `[Step ${stepNumber}] Action FAILED: "${action}"`, { error: msg });
              consecutiveFailures++;
              sendThought("Narrator", `That didn't quite work — let me try a different approach...`, "thinking");
              await captureScreenshot(page);
              const errCtx = await getPageContext(page);
              return { ...errCtx, error: msg };
            }

            await page.waitForTimeout(2000);
            await captureScreenshot(page);

            const ctx = await getPageContext(page);

            // Track content for stale page detection
            const contentLoop = trackContent(String(ctx.pageContent || ""));
            if (contentLoop) {
              sendThought("Narrator", "The page doesn't seem to be changing. Let me wrap up with what I have.", "thinking");
              return { ...ctx, error: contentLoop };
            }

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
            if (forceStopReason) return { error: forceStopReason, forceStopped: true };
            const abortMsg = checkAbort();
            if (abortMsg) return { error: abortMsg };

            stepNumber++;

            const loopMsg = checkLoop("extract_info", extractInstruction);
            if (loopMsg) return { error: loopMsg };

            devLog.info("navigator", `[Step ${stepNumber}] extract_info: "${extractInstruction}"`);

            try {
              const extractTimer = devLog.time("stagehand", `extract("${extractInstruction}")`);
              const result = await stagehand.extract(extractInstruction);
              extractTimer({
                success: true,
                resultPreview: JSON.stringify(result).substring(0, 500),
              });
              await captureScreenshot(page);
              return result;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              devLog.warn("navigator", `extract failed, falling back to innerText`, { error: msg });
              sendThought("Narrator", "Having a bit of trouble reading this page, let me try another way...", "thinking");
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
            "Describe the current page to the blind user after every page load and significant action. Give a spoken, task-relevant summary with concrete facts, and end with actionable options.",
          inputSchema: z.object({
            description: z.string().describe("Natural spoken narration with context, concrete facts (names/prices/ratings/counts), optional minimal orientation if action-relevant, and clear next-step choices"),
            detailLevel: z
              .enum(["concise", "normal", "detailed"])
              .optional()
              .describe("Adaptive narration level: concise for simple state, detailed for complex pages"),
          }),
          execute: async ({ description, detailLevel = "normal" }) => {
            if (forceStopReason) return { error: forceStopReason, forceStopped: true };
            stepNumber++;
            devLog.info("navigator", `[Step ${stepNumber}] narrate (${detailLevel}): "${description.substring(0, 200)}"`);

            // Detect if this narration contains a substantive answer (prices, ratings, summaries)
            const hasSpecificData = /\$\d|★|⭐|\d+\.\d+.star|\d+ star|rating/i.test(description);
            const minSummaryLength = detailLevel === "concise" ? 100 : detailLevel === "detailed" ? 180 : 150;
            const isSummaryLike =
              description.length > minSummaryLength && (hasSpecificData || /found|here's|result|option|price|rating/i.test(description));
            if (isSummaryLike) {
              substantiveNarrations++;
              // After 2 substantive answers, the model has what it needs — force stop
              if (substantiveNarrations >= 2) {
                sendThought("Narrator", description, "answer");
                finalMessage = description;
                forceStop("Answer found — stopping to avoid repetition");
                return { narrated: true, done: true };
              }
            }
            sendThought("Narrator", description, "thinking");
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
            if (forceStopReason) return { error: forceStopReason, forceStopped: true };
            const abortMsg = checkAbort();
            if (abortMsg) return { error: abortMsg };

            stepNumber++;
            devLog.info("navigator", `[Step ${stepNumber}] ask_user: "${question}"`);
            sendThought("Narrator", `Question: ${question}`, "thinking");

            const answer = await askQuestion(question, options);
            devLog.info("navigator", `[Step ${stepNumber}] User answered: "${answer}"`);
            sendThought("Navigator", `User responded: "${answer}"`, "thinking");

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
            sendThought("Narrator", summary, "answer");
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

    // Build the best possible summary
    let message = finalMessage || text;
    if (!message) {
      // Use the last narrator narration as fallback (skip action descriptions like "Opening..." / "Clicking...")
      const narrations = narratorMessages.filter(
        (m) => !m.endsWith("...") || m.length > 80
      );
      message = narrations.length > 0
        ? narrations[narrations.length - 1]
        : `I finished browsing. Currently on: ${await page.title().catch(() => page.url())}`;
    }
    devLog.info("navigator", `========== DONE (${stepNumber} steps) ==========`, {
      message: message.substring(0, 300),
    });
    return { success: true, message };
  } catch (error) {
    // If this was our intentional force-stop (loop/abort), return gracefully
    if (forceStopReason) {
      devLog.info("navigator", `Force-stopped after ${stepNumber} steps: ${forceStopReason}`);
      // Capture final state for the user
      try {
        const stagehand = await getStagehand();
        const p = stagehand.context.activePage();
        if (p) await captureScreenshot(p);
      } catch { /* ignore */ }

      // User-initiated cancel: just stop cleanly, no summary
      if (forceStopReason === "Cancelled by user") {
        return { success: true, message: "Stopped." };
      }

      // If finalMessage is already set, it was already narrated by the tool that set it
      // (narrate or done), so don't re-send it as a thought.
      if (finalMessage) {
        return { success: true, message: finalMessage };
      }
      const message = `I had to stop early (${forceStopReason}). Here's what I found so far on the page.`;
      sendThought("Narrator", message, "answer");
      return { success: true, message };
    }

    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    devLog.error("navigator", `Navigator failed: ${errorMsg}`);
    sendThought("Narrator", `I ran into a problem — ${errorMsg}. Let me try a different approach.`, "thinking");

    // Try a simple direct navigation as last resort
    try {
      const stagehand = await getStagehand();
      const page = stagehand.context.activePage();
      if (page) {
        const url = buildSearchUrl(instruction);
        devLog.warn("navigator", `Fallback: direct navigation to ${url}`);
        sendThought("Narrator", `Let me try searching for that directly...`, "thinking");
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
