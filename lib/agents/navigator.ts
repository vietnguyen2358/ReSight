import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import {
  navigateTo,
  getCurrentUrl,
  getPageTitle,
  waitFor,
  evaluateInPage,
  takeScreenshot,
  performAction,
  extractData,
} from "@/lib/stagehand/browser";
import { devLog } from "@/lib/dev-logger";
import { isAborted, setLastUrl, registerNavigatorController, clearNavigatorController } from "./cancellation";
import { askQuestion } from "./clarification";
import { describeScreenshot } from "./vision";
import { findSimilarFlow } from "./playbook";
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

const NAVIGATOR_SYSTEM = `You are the Navigator for ReSight, a voice-controlled web browser for BLIND users. You are their eyes — browsing the web on their behalf, narrating everything clearly so they always know what's happening. Think of yourself as a knowledgeable friend sitting next to them.

## Your Personality
You are literally a friend sitting next to a blind person, being their eyes on the screen. Talk EXACTLY like that — casual, warm, a little excited when you find good stuff.

- Good: "Alright, pulling up Amazon real quick..." Bad: "I am now navigating to amazon.com"
- Good: "Oh nice, they've got a solid deal on this one — $21 with great reviews." Bad: "The product is priced at $21.12 and has a rating of 4.6 stars."
- Good: "Found some good options!" Bad: "I have found several results matching your query."
- NEVER use robotic phrases: "I am now...", "Proceeding to...", "Executing...", "The page shows...", "I can see that..."
- Tell them what's happening on screen — what changed, what's here, what they can do. Include key content (prices, ratings) but also mention things only a sighted person would notice.
- Don't narrate what you're DOING (scrolling, clicking, loading). Narrate what you FOUND.
- NEVER refuse to do something the user asked for. If they said "order it" or "add to cart", do it. You are their hands.

## Vision-First Narration (CRITICAL)
When you use goto_url or do_action, the tool result includes a \`visualDescription\` field — a rich description of what the page LOOKS like (layout, colors, images, prominent content). This is your PRIMARY source for understanding and describing pages.

The DOM-extracted fields (pageContent, headings, prices, ratings) are your BACKUP for exact data — use them to confirm specific numbers, but lead with the visual experience.

You are their EYES, not their screen reader. A screen reader dumps text. YOU tell them what's going on — what happened, what's here, what they can do — like a friend who can see the screen.

**GOOD (vision + context, practical):**
- "Amazon pulled up a bunch of protein powders — the top one is Optimum Nutrition Gold Standard at $32, 4.7 stars with like 8,000 reviews. Dymatize ISO100 is right below that at $28. Want me to dig into either of those?"
- "Alright, clicking compose opened up an email draft modal — there's fields for who you're sending to, a subject line, and the body. You can also minimize or close it if you change your mind. Who do you want to send this to?"
- "Okay so Philz Coffee is showing up at 4.5 stars, about a 5-minute walk from SJSU. Their hours say 6am to 8pm today. There's a big Order Online button if you want to go that route."

**BAD (screen-reader data dump):**
- "The search results show: 1. Optimum Nutrition Gold Standard, $32, 4.7 stars. 2. Dymatize ISO100, $28, 4.5 stars. 3. Garden of Life, $35, 4.3 stars."
- "The page has a header with navigation links. Below that are product listings with prices and ratings."

**BAD (over-describing visuals):**
- "The page has a warm, earthy color scheme with brown tones and a big hero photo. The clean white grid layout features three columns with bright product photos on a white background..."

## Your Tools
1. **goto_url** — Navigate to a URL
2. **do_action** — Perform ONE simple action (click, type, scroll, press Enter, etc.)
3. **extract_info** — Read/extract specific information from the current page
4. **narrate** — Blend the visual description with factual data into a natural, spoken update
5. **ask_user** — Ask the user a clarifying question when genuinely ambiguous
6. **done** — Signal task completion with a conversational summary

## NARRATION RULES (CRITICAL)
Do NOT narrate after every single action. Narrate at MILESTONES only:
- After arriving at a page with useful results
- After finding key information the user needs
- When the user needs to make a choice

NEVER narrate for: routine scrolling, clicking, typing, intermediate page loads, or status updates.

**LENGTH: 2-3 sentences MAX per narration. Be dense with info, not wordy.**
BAD (too long): "I'm on the Target search results page and I can see a bunch of protein powder options. The top one is Optimum Nutrition Gold Standard which costs $32 and has a 4.7 star rating with about 8,000 reviews. Below that there's Dymatize ISO100 which is a bit cheaper at $28 and also has good reviews. Want me to dig into either of those?"
GOOD: "Nice, Target's got options! Top pick is Optimum Nutrition Gold Standard — $32, 4.7 stars, 8K reviews. Dymatize ISO100 is $28 if you want cheaper. Want me to dig into either?"

Pack info densely. No fluff, no repeating yourself, no describing things twice.
No markdown, no bullet lists. Do NOT describe UI chrome unless directly relevant.

## ANSWERING STRATEGY (CRITICAL)
Answer QUICKLY. Highlights only — never data dumps.

- Prices/menus: price range + 2-3 popular items max
- Products: top 2-3 with prices and ratings from the SEARCH RESULTS page, then offer to dig deeper
- Places: rating, address, one standout detail
- Got enough? Call done IMMEDIATELY. Google snippet = enough.
- Offer to go deeper, don't just go deeper.

## WHEN TO CLICK INTO PAGES vs. STAY ON SEARCH RESULTS
- **Search results pages** (Google, Amazon, etc.) only have titles, prices, star ratings, and short snippets. That's enough for a quick overview.
- **DO NOT try to extract detailed info (reviews, pros/cons, features, descriptions) from a search results page.** That info isn't there — you'd just be hallucinating or getting garbage.
- If the user wants details, comparisons, reviews, or descriptions: **click into the individual product/page** using goto_url, THEN extract the detailed info from that page.
- If the user asks to "compare" products: click into each one, extract key details, then summarize.
- Screenshots and extract_info are great AFTER you're on the right page — not as a substitute for navigating there.

**Done summary: 2-3 sentences, UNDER 50 WORDS. Pack it tight.**
- BAD (too wordy): "I found 15 protein powder options. The top one is Optimum Nutrition Gold Standard which is priced at $32 with 4.7 stars and 8,000 reviews. Below that is Dymatize ISO100 at $28."
- GOOD: "Solid picks! Optimum Nutrition Gold Standard — $32, 4.7 stars. Dymatize ISO100 is cheaper at $28. Want me to compare them?"
- BAD: "Based on the search results, there are several coffee shops near SJSU with high ratings including Philz Coffee which has 4.5 stars."
- GOOD: "A few great spots! Philz is closest with 4.5 stars, Voyager has 4.7, and Nirvana Soul's got the most reviews. Want hours for any?"

## COMMON WEB PATTERNS (Handle Automatically)
- **Cookie/consent popups**: Dismiss them immediately, then say "I dismissed a cookie popup, now I can see the actual page..."
- **Newsletter/signup modals**: Close them, say "There was a signup popup, I closed it..."
- **Login walls / ordering / checkout**: When the page has a login form OR hasLoginForm is true in the tool result, OR the user is trying to order/buy/checkout:
  1. Tell the user: "This site needs you to log in. Let me help you with that."
  2. Ask for their email/username with ask_user: "What's your email or username for this site?"
  3. Use do_action to type it into the email/username field
  4. Ask for their password with ask_user: "And your password?"
  5. Use do_action to type it into the password field
  6. Use do_action to click the sign-in/login button
  7. Narrate whether login succeeded or failed
  IMPORTANT: Do NOT give up on login. Do NOT tell the user to log in manually. Always attempt the login flow yourself using ask_user and do_action. Their login will be saved automatically for future sessions.
- **Captchas**: Tell the user: "There's a captcha here. Let me wait a moment to see if it resolves..." Wait a few seconds, then check again. If it persists, tell the user.
- **Access denied / bot blocks**: If a goto_url result contains "blocked":true (and NOT "hasLoginForm":true), fall back to Google search. But if the result has "hasLoginForm":true, attempt the login flow instead of giving up.

## BLOCKED SITES
- yelp.com — blocks automated browsers with CAPTCHAs. NEVER navigate to yelp.com directly.
  Instead, search Google for the Yelp info you need (e.g. "best boba Palo Alto site:yelp.com").
  Google snippets show Yelp ratings, review counts, addresses, and top reviews — extract that info
  directly from the Google results page without clicking through to Yelp.

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
- NEVER respond with just text asking for clarification. If the request is vague ("find me a video"), just GO there and pick something popular/trending. Use ask_user ONLY if you're already on a page and need a specific choice.

## RULES
- ALWAYS start by calling goto_url. NEVER respond with just text — you are a browser, not a chatbot.
- Complete the task efficiently. One action at a time.
- Start with goto_url, then narrate, then continue.
- If something fails, try a different approach — tell the user casually: "That didn't work, let me try another way..."
- NEVER call done until you have a real answer.
- Call done AS SOON AS you have enough. Don't over-browse.
- If you see "LOOP DETECTED", "STEP LIMIT REACHED", "TOO MANY FAILURES", "STALE PAGE", or "ABORTED", call done IMMEDIATELY with what you have.
- Your done summary MUST be 2-3 sentences, under 50 words — casual, packed with specifics.
- End with something natural: "Want me to grab the vanilla one?" not "Would you like me to assist further?"
- NEVER use formal closings like "Is there anything else I can help with?" or "Let me know if you need anything else."
- NEVER refuse to complete a purchase, add to cart, or checkout that the user asked for. You are their hands — if they say "buy it", you buy it. If login is needed, help them log in. If payment is needed, walk them through it.

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

Amazon — Shopping & Ordering:
1. goto_url("https://www.amazon.com/s?k={search terms}") — use URL search params directly, don't type in the search box
2. extract_info to get product names, prices, ratings, AND product URLs (the href links)
3. narrate the top 2-3 results with prices and ratings — this is a QUICK OVERVIEW only
4. To get details/reviews/features for a product: extract_info to get its URL, then goto_url to that product page. Do NOT try to extract reviews from the search results page — they aren't there.
5. To compare products: visit each product page individually, extract details from each, then summarize the comparison.
6. To add to cart: use do_action to click "Add to Cart". If it fails, try extract_info to find the add-to-cart URL and goto_url to it.
7. To checkout: goto_url("https://www.amazon.com/gp/cart/view.html") then click "Proceed to checkout"
8. If login is required for checkout, follow the login flow (ask_user for credentials)
9. NEVER refuse to complete a purchase the user asked for. If the user said "order it", follow through.
10. GENERAL TIP: If do_action fails repeatedly on a page, switch to extract_info to get URLs and navigate via goto_url instead.
11. Do NOT use do_action to click product titles — clicking often fails on Amazon. Use extract_info to get URLs and goto_url instead.

Target / Walmart — Shopping:
1. goto_url to the site with search params
2. Search via the search box if needed
3. narrate the top 2-3 products with prices and ratings — don't list everything

Google — Search:
1. goto_url("https://www.google.com/search?q={query}") — use URL params directly
2. narrate the top results
3. If the Google snippet already answers the question, call done — don't click through`;

async function getPageContext() {
  const url = await getCurrentUrl();
  const title = await getPageTitle();

  let structured;
  try {
    structured = await evaluateInPage(() => {
      const text = (document.body.innerText || "").substring(0, 1500);

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
    });
  } catch {
    structured = {
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
    };
  }

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
  registerNavigatorController(controller);
  let forceStopReason = "";

  function forceStop(reason: string) {
    if (forceStopReason) return; // already stopping
    devLog.warn("navigator", `FORCE STOP: ${reason}`);
    // Send wrap-up message BEFORE setting flag so it passes the sendThought guard
    if (reason !== "Cancelled by user") {
      sendThought("Narrator", "Alright, let me tell you what I've got so far.", "thinking");
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

  // Internal status updates — shown subtly in UI, not as prominent narrator blocks
  const statusThought = (message: string) => sendThought("Navigator", message, "thinking");

  // Track last tool for context-aware keepalive messages
  const runState = { lastToolName: "", lastToolArg: "" };

  try {
    const startUrl = await getCurrentUrl();
    setLastUrl(startUrl);
    devLog.info("navigator", `Active page: ${startUrl}`);
    const startCtx = await getPageContext();

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

    // Look up a similar past flow to use as few-shot reference
    const playbookMatch = findSimilarFlow(instruction);
    const playbookContext = playbookMatch
      ? `\n\nREFERENCE — A similar task was handled before. Use this as a guide for approach and tone:\nTask: "${playbookMatch.userInstruction}"\n${playbookMatch.reference}`
      : "";
    if (playbookMatch) {
      devLog.info("navigator", `Playbook match: "${playbookMatch.title}" (${playbookMatch.agents.join(", ")})`);
    }

    const navigatorPrompt = `Current URL: ${startCtx.currentUrl}\nPage title: ${startCtx.pageTitle || "(blank)"}\nPage signals: ${JSON.stringify(startCtx.pageSignals)}${factsBlock}${playbookContext}\n\nTask: ${instruction}`;


    devLog.info("llm", "Navigator generateText call", {
      prompt: navigatorPrompt,
      maxSteps: 12,
    });

    const navDone = devLog.time("llm", "Navigator full generateText loop");

    // Context-aware keepalive: message reflects instruction + what we're doing
    const truncate = (s: string, len: number) => (s.length <= len ? s : s.slice(0, len).trim() + "...");
    const taskSnippet = truncate(instruction.replace(/^(find|search|look for|get|open|go to|check|tell me about)\s+/i, ""), 45);
    const getKeepaliveMessage = (stage: 0 | 1 | 2) => {
      const { lastToolName, lastToolArg } = runState;
      let gotoMsg = "loading the page...";
      if (lastToolArg) {
        try {
          const u = new URL(lastToolArg.startsWith("http") ? lastToolArg : `https://${lastToolArg}`);
          const q = u.searchParams.get("q") || u.searchParams.get("query") || u.searchParams.get("k");
          if (q) {
            gotoMsg = `searching for ${truncate(decodeURIComponent(q.replace(/\+/g, " ")), 35)}...`;
          } else {
            gotoMsg = `loading ${truncate(u.hostname.replace(/^www\./, ""), 30)}...`;
          }
        } catch {
          gotoMsg = `loading ${truncate(lastToolArg.replace(/^https?:\/\/(www\.)?/, ""), 30)}...`;
        }
      }
      const extractSnippet = runState.lastToolArg ? truncate(runState.lastToolArg.replace(/^(extract|list|get|find|read)\s+/i, ""), 30) : "";
      const phases: Record<string, string> = {
        goto_url: gotoMsg,
        do_action: "waiting for the page to respond...",
        extract_info: extractSnippet ? `gathering ${extractSnippet}...` : "reading through the page...",
        narrate: "putting together what I found...",
      };
      const phaseMsg = phases[lastToolName] || (taskSnippet ? `working on ${taskSnippet}...` : "on it...");
      const stagePrefix = ["Still ", "Taking a bit longer — ", "Almost there — "][stage];
      return stagePrefix + phaseMsg;
    };

    const KEEPALIVE_MS = [5000, 15000, 30000];
    const keepaliveIds: ReturnType<typeof setTimeout>[] = [];
    KEEPALIVE_MS.forEach((ms, i) => {
      const id = setTimeout(() => {
        if (forceStopReason) return;
        statusThought(getKeepaliveMessage(i as 0 | 1 | 2));
      }, ms);
      keepaliveIds.push(id);
    });
    const clearKeepalive = () => keepaliveIds.forEach((id) => clearTimeout(id));

    let text: string | undefined;
    let steps: unknown;
    try {
      const result = await generateText({
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

            runState.lastToolName = "goto_url";
            runState.lastToolArg = url;
            stepNumber++;
            let fullUrl = url;
            if (!fullUrl.startsWith("http")) fullUrl = `https://${fullUrl}`;

            // Hard-block sites that always trigger CAPTCHAs
            const BLOCKED_DOMAINS: string[] = [];
            try {
              const hostname = new URL(fullUrl).hostname.replace("www.", "");
              if (BLOCKED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
                statusThought(`That site blocks automated browsers, trying a different approach...`);
                return {
                  blocked: true,
                  blockType: "Known CAPTCHA site",
                  suggestion: `${hostname} always blocks automated browsers. Use Google search instead: goto_url("https://www.google.com/search?q=${encodeURIComponent(instruction)}")`,
                };
              }
            } catch { /* ignore URL parse errors */ }

            const loopMsg = checkLoop("goto_url", fullUrl);
            if (loopMsg) return { error: loopMsg, currentUrl: await getCurrentUrl(), pageTitle: await getPageTitle() };

            devLog.info("navigation", `[Step ${stepNumber}] goto_url: ${fullUrl}`);
            // Build a descriptive navigation message
            const parsedUrl = new URL(fullUrl);
            const siteName = parsedUrl.hostname.replace("www.", "");
            const searchQuery = parsedUrl.searchParams.get("q") || parsedUrl.searchParams.get("query") || parsedUrl.searchParams.get("searchTerm") || parsedUrl.searchParams.get("k");
            const navMessage = searchQuery
              ? `Searching for "${searchQuery}" real quick...`
              : `Pulling up ${siteName}...`;
            statusThought(navMessage);

            // Track URL for go-back support
            setLastUrl(await getCurrentUrl());

            const navTimer = devLog.time("navigation", `navigateTo(${fullUrl})`);
            try {
              await navigateTo(fullUrl);
              navTimer({ success: true, url: fullUrl });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              navTimer({ success: false, error: msg }, "warn");
              statusThought("Page is loading slowly, but still going...");
            }

            // Wait for page to settle (reduced from 6s — captcha retry has its own wait)
            await waitFor(2000);
            let latestScreenshot = await takeScreenshot();

            const pageTitle = await getPageTitle() || fullUrl;

            let ctx = await getPageContext();
            consecutiveFailures = 0;

            // Detect bot blocks — but give captcha solver a second chance
            let blockType = detectBotBlock(String(ctx.pageContent || ""), String(ctx.pageTitle || ""));
            if (blockType) {
              devLog.info("navigator", `Bot block detected (${blockType}), waiting longer for captcha solver...`);
              await waitFor(6000); // extra wait for captcha solver
              latestScreenshot = await takeScreenshot();
              ctx = await getPageContext();
              blockType = detectBotBlock(String(ctx.pageContent || ""), String(ctx.pageTitle || ""));
            }

            if (blockType) {
              // If the page has a login form, don't hard-block — let the LLM try login
              if (ctx.pageSignals && (ctx.pageSignals as Record<string, boolean>).hasLoginForm) {
                devLog.info("navigator", `Bot block + login form detected on ${fullUrl} — letting LLM attempt login`);
                return {
                  ...ctx,
                  hasLoginForm: true,
                  note: "This page has a login form. Try logging in using ask_user for credentials and do_action to fill them in.",
                };
              }
              devLog.warn("navigator", `Bot block confirmed: ${blockType} on ${fullUrl}`);
              statusThought(`Site is blocking automated access, trying another approach...`);
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

            // Conversational checkpoint — let blind users know we're making progress
            const loadedPhrases = [
              "Alright, page is up. Taking a look...",
              "Got it loaded, checking it out...",
              "Okay cool, let me see what's here...",
              "Page is here, reading through it...",
            ];
            sendThought("Narrator", loadedPhrases[stepNumber % loadedPhrases.length], "thinking");

            // Get visual description (uses already-captured screenshot)
            let visualDescription = "";
            try {
              if (latestScreenshot) {
                sendThought("Navigator → Vision", "Analyzing what's on screen...");
                visualDescription = await describeScreenshot(latestScreenshot, instruction);
              }
            } catch { /* vision is best-effort */ }

            devLog.info("navigator", `[Step ${stepNumber}] goto_url complete`, {
              finalUrl: ctx.currentUrl,
              pageTitle: ctx.pageTitle,
              hasVisualDesc: !!visualDescription,
            });
            return { ...ctx, visualDescription };
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

            runState.lastToolName = "do_action";
            runState.lastToolArg = action;
            stepNumber++;

            const loopMsg = checkLoop("do_action", action);
            if (loopMsg) return { error: loopMsg, currentUrl: await getCurrentUrl(), pageTitle: await getPageTitle() };

            devLog.info("navigator", `[Step ${stepNumber}] do_action: "${action}"`);
            // Make action descriptions conversational
            const target = action.replace(/^(click|tap)\s+(the\s+|on\s+)?/i, "");
            const friendlyAction = action.toLowerCase().startsWith("click") || action.toLowerCase().startsWith("tap")
              ? `Hitting ${target}...`
              : action.toLowerCase().startsWith("type")
                ? `Filling that in...`
                : action.toLowerCase().startsWith("scroll")
                  ? "Scrolling down a bit..."
                  : action.toLowerCase().startsWith("press")
                    ? `Pressing ${action.replace(/^press\s+/i, "")}...`
                    : `${action}...`;
            statusThought(friendlyAction);

            const actTimer = devLog.time("stagehand", `act("${action}")  [via navigator tool]`);
            try {
              await performAction(action);
              actTimer({ success: true });
              consecutiveFailures = 0;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              actTimer({ success: false, error: msg }, "error");
              devLog.error("navigator", `[Step ${stepNumber}] Action FAILED: "${action}"`, { error: msg });
              consecutiveFailures++;
              statusThought(`Action failed, trying a different approach...`);
              await takeScreenshot();
              const errCtx = await getPageContext();
              return { ...errCtx, error: msg };
            }

            await waitFor(1000);
            const actionScreenshot = await takeScreenshot();

            // Parallelize page context extraction and vision description
            if (actionScreenshot) {
              sendThought("Navigator → Vision", "Analyzing what's on screen...");
            }
            const [ctx, visualDescription] = await Promise.all([
              getPageContext(),
              (async () => {
                try {
                  if (actionScreenshot) {
                    return await describeScreenshot(actionScreenshot, instruction);
                  }
                } catch { /* vision is best-effort */ }
                return "";
              })(),
            ]);

            // Track content for stale page detection
            const contentLoop = trackContent(String(ctx.pageContent || ""));
            if (contentLoop) {
              statusThought("Page unchanged, wrapping up...");
              return { ...ctx, error: contentLoop };
            }

            devLog.info("navigator", `[Step ${stepNumber}] do_action complete`, {
              currentUrl: ctx.currentUrl,
              pageTitle: ctx.pageTitle,
              hasVisualDesc: !!visualDescription,
            });
            return { ...ctx, visualDescription };
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

            runState.lastToolName = "extract_info";
            runState.lastToolArg = extractInstruction;
            stepNumber++;

            const loopMsg = checkLoop("extract_info", extractInstruction);
            if (loopMsg) return { error: loopMsg };

            devLog.info("navigator", `[Step ${stepNumber}] extract_info: "${extractInstruction}"`);

            // Conversational checkpoint
            const extractPhrases = [
              "Reading through the page...",
              "Let me pull out the details...",
              "Scanning for the info you need...",
              "Grabbing the key details...",
            ];
            sendThought("Narrator", extractPhrases[stepNumber % extractPhrases.length], "thinking");

            try {
              const extractTimer = devLog.time("stagehand", `extract("${extractInstruction}")`);
              const result = await extractData(extractInstruction);
              extractTimer({
                success: true,
                resultPreview: JSON.stringify(result).substring(0, 500),
              });
              await takeScreenshot();
              return result;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              devLog.warn("navigator", `extract failed, falling back to innerText`, { error: msg });
              statusThought("Having trouble reading page, trying fallback...");
              const fallbackText = await evaluateInPage(
                () => document.body.innerText.substring(0, 3000)
              ).catch(() => "Could not read page text");
              await takeScreenshot();
              return { pageText: fallbackText };
            }
          },
        }),

        narrate: tool({
          description:
            "Share a meaningful update with the user. ONLY call this when you have new useful information — after finding results, comparing options, or reaching an important page. Do NOT call after routine scrolling, clicking, or typing. Think of it as talking to a friend: only speak up when you have something worth saying.",
          inputSchema: z.object({
            description: z.string().describe("Conversational update packed with specific facts (names, prices, ratings). Talk like a friend, not a robot. No markdown or bullet lists."),
            detailLevel: z
              .enum(["concise", "normal", "detailed"])
              .optional()
              .describe("Adaptive narration level: concise for simple state, detailed for complex pages"),
          }),
          execute: async ({ description, detailLevel = "normal" }) => {
            if (forceStopReason) return { error: forceStopReason, forceStopped: true };
            runState.lastToolName = "narrate";
            runState.lastToolArg = "";
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
            "Call when the task is fully complete. Your summary will be SPOKEN ALOUD — 2-3 sentences, under 50 words. Pack in specifics (names, prices, ratings). End with a quick follow-up offer.",
          inputSchema: z.object({
            summary: z.string().describe("2-3 sentence summary under 50 words. Specific names/prices/ratings. Natural follow-up at the end."),
          }),
          execute: async ({ summary }) => {
            stepNumber++;
            devLog.info("navigator", `[Step ${stepNumber}] done: "${summary.substring(0, 200)}"`);
            sendThought("Narrator", summary, "answer");
            finalMessage = summary;
            await takeScreenshot();
            return { done: true };
          },
        }),
      },
    });
      text = result.text;
      steps = result.steps;
    } finally {
      clearKeepalive();
    }

    navDone({
      totalSteps: stepNumber,
      llmSteps: Array.isArray(steps) ? steps.length : 0,
      finalUrl: await getCurrentUrl(),
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
        : `I finished browsing. Currently on: ${await getPageTitle() || await getCurrentUrl()}`;
    }
    // Never return the generic "blank page" / "starting fresh" message when we did nothing
    const isBlankPageGeneric = stepNumber === 0 && /starting fresh|blank page|ready to help.*what would you like/i.test(message);
    if (isBlankPageGeneric) {
      message = "What would you like me to find or do on the web?";
    }
    devLog.info("navigator", `========== DONE (${stepNumber} steps) ==========`, {
      message: message.substring(0, 300),
    });
    clearNavigatorController();
    return { success: true, message };
  } catch (error) {
    clearNavigatorController();

    // External abort (new instruction superseded this one) — stop silently
    const isAbortError = error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"));
    if (isAbortError && !forceStopReason) {
      devLog.info("navigator", `Externally aborted after ${stepNumber} steps (new instruction took over)`);
      return { success: true, message: "Stopped." };
    }

    // If this was our intentional force-stop (loop/abort), return gracefully
    if (forceStopReason) {
      devLog.info("navigator", `Force-stopped after ${stepNumber} steps: ${forceStopReason}`);
      // Capture final state for the user
      try {
        await takeScreenshot();
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
      const message = `Alright, I had to cut it short but here's what I found so far.`;
      sendThought("Narrator", message, "answer");
      return { success: true, message };
    }

    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    devLog.error("navigator", `Navigator failed: ${errorMsg}`);
    sendThought("Narrator", `Hmm, ran into a snag — let me try another way.`, "thinking");

    // Try a simple direct navigation as last resort
    try {
      const url = buildSearchUrl(instruction);
      devLog.warn("navigator", `Fallback: direct navigation to ${url}`);
      statusThought(`Trying a direct search as fallback...`);
      await navigateTo(url);
      await takeScreenshot();
      return {
        success: true,
        message: `I opened a search for that. Currently on: ${await getCurrentUrl()}`,
      };
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
