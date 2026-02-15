import { getStagehand } from "./session";
import { setLatestScreenshot } from "./screenshot";
import { devLog } from "@/lib/dev-logger";

/** Check the global abort flag (same globalThis flag used by cancellation.ts). */
function isAborted(): boolean {
  return (globalThis as unknown as { __resightAbort?: boolean }).__resightAbort === true;
}

/** Race a promise against the global abort flag. Checks every 500ms. */
function withAbortCheck<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const id = setInterval(() => {
        if (isAborted()) {
          clearInterval(id);
          reject(new Error(`${label} aborted by new instruction`));
        }
      }, 500);
      // Clean up interval when original promise settles
      promise.finally(() => clearInterval(id));
    }),
  ]);
}

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
  const { waitUntil = "domcontentloaded", timeoutMs = 30000 } = options ?? {};
  devLog.info("navigation", `navigateTo: ${url}`);
  await withAbortCheck(page.goto(url, { waitUntil, timeoutMs }), "navigateTo");
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

/** Run a function in the browser page context, with a 10s timeout to avoid hangs on heavy SPAs. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function evaluateInPage<T>(fn: () => T, timeoutMs = 10000): Promise<T> {
  const page = await getPage();
  return Promise.race([
    page.evaluate(fn),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("evaluateInPage timed out")), timeoutMs)
    ),
  ]);
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
  return withAbortCheck(stagehand.act(instruction), "performAction");
}

/** Use Stagehand AI to extract structured data from the page. */
export async function extractData(instruction: string) {
  const stagehand = await getStagehand();
  return withAbortCheck(stagehand.extract(instruction), "extractData");
}

/** Use Stagehand AI to observe interactive elements on the page. */
export async function observeElements(instruction?: string) {
  const stagehand = await getStagehand();
  devLog.info("stagehand", `observeElements: "${instruction || "(default)"}"`)
  return stagehand.observe(instruction as string);
}
