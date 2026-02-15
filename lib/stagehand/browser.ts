import { getStagehand } from "./session";
import { setLatestScreenshot } from "./screenshot";
import { devLog } from "@/lib/dev-logger";

// ════════════════════════════════════════════════════════════════════════════════
// PLAYWRIGHT DIRECT — deterministic, fast, no LLM
// ════════════════════════════════════════════════════════════════════════════════

/** Get the active Playwright page from the Stagehand session. */
export async function getPage() {
  const stagehand = await getStagehand();
  const page = stagehand.context.activePage();
  if (!page) throw new Error("No active page available");
  return page;
}

/** Navigate the browser to a URL. Returns after the page settles. */
export async function navigateTo(
  url: string,
  options?: { waitUntil?: "domcontentloaded" | "load" | "networkidle"; timeoutMs?: number }
) {
  const page = await getPage();
  const { waitUntil = "domcontentloaded", timeoutMs = 15000 } = options ?? {};
  devLog.info("navigation", `navigateTo: ${url}`);
  await page.goto(url, { waitUntil, timeoutMs });
}

/** Navigate the browser back one page. */
export async function goBack(
  options?: { waitUntil?: "domcontentloaded" | "load" | "networkidle"; timeoutMs?: number }
) {
  const page = await getPage();
  const { waitUntil = "domcontentloaded", timeoutMs = 10000 } = options ?? {};
  devLog.info("navigation", `goBack`);
  await page.goBack({ waitUntil, timeoutMs }).catch(() => {});
}

/** Get the current page URL. */
export async function getCurrentUrl(): Promise<string> {
  const page = await getPage();
  return page.url();
}

/** Get the current page title, with empty-string fallback. */
export async function getPageTitle(): Promise<string> {
  const page = await getPage();
  return page.title().catch(() => "");
}

/** Wait for a given number of milliseconds. */
export async function waitFor(ms: number) {
  const page = await getPage();
  await page.waitForTimeout(ms);
}

/** Run a function in the browser page context. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function evaluateInPage<T>(fn: () => T): Promise<T> {
  const page = await getPage();
  return page.evaluate(fn);
}

/** Take a screenshot, cache it, and return the base64 string. */
export async function takeScreenshot(): Promise<string> {
  const page = await getPage();
  devLog.info("navigation", `takeScreenshot: ${page.url()}`);
  const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
  const base64 = Buffer.from(buffer).toString("base64");
  setLatestScreenshot(base64);
  return base64;
}

// ════════════════════════════════════════════════════════════════════════════════
// STAGEHAND AI — LLM-powered, fuzzy, uses Gemini
// ════════════════════════════════════════════════════════════════════════════════

/** Use Stagehand AI to perform an action on the page (click, type, etc.). */
export async function performAction(instruction: string) {
  const stagehand = await getStagehand();
  devLog.info("stagehand", `performAction: "${instruction}"`);
  return stagehand.act(instruction);
}

/** Use Stagehand AI to extract structured data from the page. */
export async function extractData(instruction: string) {
  const stagehand = await getStagehand();
  devLog.info("stagehand", `extractData: "${instruction}"`);
  return stagehand.extract(instruction);
}

/** Use Stagehand AI to observe interactive elements on the page. */
export async function observeElements(instruction?: string) {
  const stagehand = await getStagehand();
  devLog.info("stagehand", `observeElements: "${instruction || "(default)"}"`)
  return stagehand.observe(instruction as string);
}
