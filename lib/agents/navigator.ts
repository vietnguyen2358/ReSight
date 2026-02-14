import { getStagehand } from "@/lib/stagehand/session";
import { captureScreenshot, setLatestScreenshot } from "@/lib/stagehand/screenshot";
import { chromium } from "playwright";
import type { SendThoughtFn, AgentResult } from "./types";

function cleanSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractShoppingQuery(instruction: string): string {
  const text = cleanSearchText(instruction);

  const tokens: string[] = [];

  if (/\b(strawberry|vanilla|chocolate|unflavored|banana)\b/.test(text)) {
    const flavor = text.match(/\b(strawberry|vanilla|chocolate|unflavored|banana)\b/)?.[1];
    if (flavor) tokens.push(flavor);
  }

  if (/\b(whey|protein powder|protein)\b/.test(text)) {
    if (/\bwhey\b/.test(text)) {
      tokens.push("whey");
    }
    tokens.push("protein powder");
  }

  if (/\b(one|1)\s*(lb|pound)\b/.test(text)) {
    tokens.push("1 lb");
  } else if (/\b(two|2)\s*(lb|pound)\b/.test(text)) {
    tokens.push("2 lb");
  }

  if (!tokens.length) {
    const stripped = text
      .replace(/\b(can you|could you|please|find|look for|search|on amazon|amazon|the|a|an|for|that|you|i|d|like|if possible|cheapest|cheap|best)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return stripped || "protein powder";
  }

  return Array.from(new Set(tokens)).join(" ");
}

function buildFallbackUrl(instruction: string): string {
  const trimmed = instruction.trim();
  const directUrlMatch = trimmed.match(
    /\b(https?:\/\/[^\s]+|(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)\b/i
  );

  if (directUrlMatch) {
    const candidate = directUrlMatch[1];
    return candidate.startsWith("http") ? candidate : `https://${candidate}`;
  }

  if (/amazon/i.test(trimmed)) {
    const query = encodeURIComponent(extractShoppingQuery(trimmed));
    return `https://www.amazon.com/s?k=${query}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(extractShoppingQuery(trimmed))}`;
}

function isSearchInstruction(instruction: string): boolean {
  return /search|find|look for|go to|navigate|open|visit|amazon|google|https?:\/\/|www\./i.test(
    instruction
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryInteractOnCurrentPage(page: any, instruction: string): Promise<boolean> {
  const lowered = instruction.toLowerCase();
  const wantsIngredientsOrNutrition =
    /ingredient|nutrition|supplement facts|nutrition facts|label/i.test(lowered);
  const wantsClickOrOpen = /click|open|select|review|details|buy|purchase/i.test(lowered);

  if (!wantsIngredientsOrNutrition && !wantsClickOrOpen) return false;

  const clicked = await page.evaluate(
    ({ text, wantsIngredients }: { text: string; wantsIngredients: boolean }) => {
      const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .filter(
          (w) =>
            ![
              "can",
              "you",
              "please",
              "the",
              "a",
              "an",
              "for",
              "to",
              "and",
              "that",
              "this",
              "onto",
              "could",
              "would",
            ].includes(w)
        )
        .slice(0, 8);

      const score = (s: string) => words.filter((w) => s.includes(w)).length;
      const elements = Array.from(
        document.querySelectorAll("a, button, [role='button'], summary")
      ) as HTMLElement[];

      if (wantsIngredients) {
        const nutritionTarget = elements.find((el) =>
          /(ingredients|nutrition|supplement facts|nutrition facts)/i.test(
            (el.textContent || "").trim()
          )
        );
        if (nutritionTarget) {
          nutritionTarget.click();
          return true;
        }
      }

      const best = elements
        .map((el) => ({ el, text: (el.textContent || "").toLowerCase() }))
        .map((x) => ({ ...x, score: score(x.text) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)[0];

      if (best) {
        best.el.click();
        return true;
      }

      return false;
    },
    { text: instruction, wantsIngredients: wantsIngredientsOrNutrition }
  );

  if (clicked) {
    await page.waitForTimeout(1000);
    return true;
  }

  return false;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function summarizePageFindings(page: any): Promise<string> {
  try {
    const items = await page.evaluate(() => {
      const pickText = (el: Element | null) =>
        (el?.textContent || "").replace(/\s+/g, " ").trim();

      const candidates = Array.from(
        document.querySelectorAll('[data-component-type="s-search-result"], .sh-dgr__grid-result')
      ).slice(0, 5);

      const parsed = candidates
        .map((card) => {
          const title =
            pickText(card.querySelector("h2, h3, .a-size-base-plus, .tAxDx")) || "";
          const price =
            pickText(card.querySelector(".a-price .a-offscreen, .T14wmb, .kHxwFf")) || "";
          return { title, price };
        })
        .filter((x) => x.title);

      return parsed;
    });

    if (!Array.isArray(items) || items.length === 0) {
      return "I opened the results page, but couldn't confidently extract product cards yet.";
    }

    const top = items
      .slice(0, 3)
      .map((item, i) => `${i + 1}. ${item.title}${item.price ? ` (${item.price})` : ""}`)
      .join(" ");

    return `I found a few options: ${top}. Tell me which one to open or how to refine the search.`;
  } catch {
    return "I opened the results page. Tell me what to do next on this page.";
  }
}

export async function navigatorFallbackAgent(
  instruction: string,
  sendThought: SendThoughtFn
): Promise<AgentResult> {
  sendThought("Navigator", `Fallback navigation for: "${instruction}"`);

  try {
    const stagehand = await getStagehand();
    const page = stagehand.context.activePage();
    if (!page) throw new Error("No active page available");

    if (isSearchInstruction(instruction)) {
      const url = buildFallbackUrl(instruction);
      sendThought("Navigator", `Loading ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } else {
      const interacted = await tryInteractOnCurrentPage(page, instruction);
      if (!interacted) {
        sendThought("Navigator", "Could not confidently interact with current page; refining search.");
        const url = buildFallbackUrl(instruction);
        await page.goto(url, { waitUntil: "domcontentloaded" });
      }
    }

    const screenshotBase64 = await captureScreenshot(page);
    setLatestScreenshot(screenshotBase64);
    const findings = await summarizePageFindings(page);

    return {
      success: true,
      message: findings,
    };
  } catch (error) {
    const stagehandErr = error instanceof Error ? error.message : "Unknown error occurred";
    sendThought("Navigator", `Stagehand fallback failed, using Playwright: ${stagehandErr}`);

    try {
      const url = buildFallbackUrl(instruction);
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
      const base64 = Buffer.from(buffer).toString("base64");
      setLatestScreenshot(base64);
      const findings = await summarizePageFindings(page);
      await browser.close();

      return {
        success: true,
        message: findings,
      };
    } catch (fallbackError) {
      const fallbackMsg =
        fallbackError instanceof Error ? fallbackError.message : "Unknown fallback error";
      return {
        success: false,
        message: `Fallback navigation failed: ${fallbackMsg}`,
      };
    }
  }
}

export async function navigatorAgent(
  instruction: string,
  sendThought: SendThoughtFn
): Promise<AgentResult> {
  sendThought("Navigator", `Received instruction: "${instruction}"`);

  try {
    const stagehand = await getStagehand();
    const page = stagehand.context.activePage();
    if (!page) throw new Error("No active page available");

    // Check if instruction is a navigation command
    const urlMatch = instruction.match(
      /(?:go to|navigate to|open|visit)\s+(.+)/i
    );
    if (urlMatch) {
      let url = urlMatch[1].trim();
      if (!url.startsWith("http")) {
        url = `https://${url}`;
      }
      sendThought("Navigator", `Navigating to ${url}...`);
      await page.goto(url);
      await captureScreenshot(page);
      sendThought("Navigator", `Page loaded: ${url}`);
    }

    // Observe the page
    sendThought("Navigator", "Observing page elements...");
    const observations = await stagehand.observe(
      `Find elements relevant to: ${instruction}`
    );

    if (observations && observations.length > 0) {
      const elements = observations.slice(0, 5);
      sendThought(
        "Navigator",
        `Found ${observations.length} relevant elements`
      );

      // Update screenshot overlay with element info
      const boundingBoxes = elements
        .filter((el) => el.selector)
        .map((el) => ({
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          label: el.description || el.selector,
        }));

      if (boundingBoxes.length > 0) {
        const screenshotBase64 = await captureScreenshot(page);
        setLatestScreenshot(screenshotBase64, boundingBoxes);
      }
    }

    // Act on the instruction (if not just a navigation)
    if (!urlMatch) {
      sendThought("Navigator", `Performing action: "${instruction}"`);
      await stagehand.act(instruction);
      sendThought("Navigator", "Action completed");
    }

    // Final screenshot
    await captureScreenshot(page);
    sendThought("Navigator", "Screenshot captured");

    const currentUrl = page.url();
    return {
      success: true,
      message: `Action completed successfully. Current page: ${currentUrl}`,
    };
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error occurred";
    sendThought("Navigator", `Error: ${errorMsg}`);
    return {
      success: false,
      message: `Navigation failed: ${errorMsg}`,
    };
  }
}
