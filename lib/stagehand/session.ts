import { Stagehand } from "@browserbasehq/stagehand";
import { devLog } from "@/lib/dev-logger";
import { getUserContextValue, setUserContextValue } from "@/lib/context/user-context";

// Store on globalThis to survive Next.js hot reloads in dev mode.
// Without this, every file save resets the module-level `instance` variable,
// causing a brand new Chrome window to open.
const globalRef = globalThis as unknown as {
  __stagehand?: Stagehand;
  __stagehandInit?: Promise<Stagehand>;
};

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

/**
 * Wraps a Stagehand instance with a Proxy that intercepts act/observe/extract
 * calls and logs inputs, outputs, errors, and timing to the dev logger.
 */
function withLogging(stagehand: Stagehand): Stagehand {
  return new Proxy(stagehand, {
    get(target, prop, receiver) {
      if (prop === "act") {
        return async (instruction: string) => {
          const done = devLog.time("stagehand", `act("${instruction}")`, {
            method: "act",
            input: instruction,
          });
          try {
            const result = await target.act(instruction);
            done({ success: true, result: result ?? "ok" });
            return result;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            done({ success: false, error: msg }, "error");
            throw err;
          }
        };
      }

      if (prop === "observe") {
        return async (instruction?: string) => {
          const done = devLog.time("stagehand", `observe("${instruction || "default"}")`, {
            method: "observe",
            input: instruction || "(default)",
          });
          try {
            const result = await target.observe(instruction as string);
            const summary = Array.isArray(result)
              ? result.map((e: { description?: string }) => e.description || String(e))
              : result;
            done({
              success: true,
              elementCount: Array.isArray(result) ? result.length : 0,
              elements: summary,
            });
            return result;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            done({ success: false, error: msg }, "error");
            throw err;
          }
        };
      }

      if (prop === "extract") {
        return async (instruction: string, ...rest: unknown[]) => {
          const done = devLog.time("stagehand", `extract("${instruction}")`, {
            method: "extract",
            input: instruction,
          });
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (target.extract as any)(instruction, ...rest);
            const resultStr = JSON.stringify(result);
            done({
              success: true,
              resultPreview: resultStr.length > 500 ? resultStr.substring(0, 500) + "..." : result,
            });
            return result;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            done({ success: false, error: msg }, "error");
            throw err;
          }
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}

export async function getStagehand(): Promise<Stagehand> {
  // Reuse existing instance (survives hot reloads via globalThis)
  if (globalRef.__stagehand) return globalRef.__stagehand;

  // Deduplicate concurrent init calls
  if (globalRef.__stagehandInit) return globalRef.__stagehandInit;

  globalRef.__stagehandInit = (async () => {
    const env = (process.env.STAGEHAND_ENV as "LOCAL" | "BROWSERBASE") || "LOCAL";
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!googleApiKey) {
      devLog.error("stagehand", "Missing GOOGLE_GENERATIVE_AI_API_KEY — cannot init Stagehand");
      throw new Error(
        "GOOGLE_GENERATIVE_AI_API_KEY is required for Stagehand browser automation. " +
        "OpenRouter can only be used for the AI agent LLM calls, not for Stagehand."
      );
    }

    devLog.info("stagehand", `Initializing Stagehand`, {
      env,
      model: "gemini-2.0-flash",
      provider: "google",
      headless: true,
      browserbase: env === "BROWSERBASE",
      solveCaptchas: envBool("BROWSERBASE_SOLVE_CAPTCHAS", true),
      proxies: envBool("BROWSERBASE_PROXIES", true),
    });

    const done = devLog.time("stagehand", "Stagehand init");

    const solveCaptchas = envBool("BROWSERBASE_SOLVE_CAPTCHAS", true);
    const proxies = envBool("BROWSERBASE_PROXIES", true);
    const blockAds = envBool("BROWSERBASE_BLOCK_ADS", true);
    const captchaImageSelector = process.env.BROWSERBASE_CAPTCHA_IMAGE_SELECTOR;
    const captchaInputSelector = process.env.BROWSERBASE_CAPTCHA_INPUT_SELECTOR;

    // ── Browserbase Context (persistent login sessions) ──
    let browserbaseContext: { id: string; persist: true } | undefined;
    if (env === "BROWSERBASE") {
      let contextId = getUserContextValue("browserbase_context_id") as string | undefined;

      if (!contextId) {
        try {
          devLog.info("stagehand", "Creating new Browserbase context for login persistence");
          const res = await fetch("https://api.browserbase.com/v1/contexts", {
            method: "POST",
            headers: {
              "X-BB-API-Key": process.env.BROWSERBASE_API_KEY!,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ projectId: process.env.BROWSERBASE_PROJECT_ID }),
          });
          const ctx = await res.json();
          contextId = ctx.id as string;
          setUserContextValue("browserbase_context_id", contextId);
          devLog.info("stagehand", `Created Browserbase context: ${contextId}`);
        } catch (err) {
          devLog.warn("stagehand", `Failed to create Browserbase context: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        devLog.info("stagehand", `Reusing Browserbase context: ${contextId}`);
      }

      if (contextId) {
        browserbaseContext = { id: contextId, persist: true };
      }
    }

    const raw = new Stagehand({
      env,
      model: {
        modelName: "gemini-2.0-flash",
        apiKey: googleApiKey,
      },
      // Run headless — the user sees screenshots in the LiveFeed, not the raw browser
      ...(env === "LOCAL"
        ? { localBrowserLaunchOptions: { headless: true } }
        : {}),
      ...(env === "BROWSERBASE"
        ? {
            apiKey: process.env.BROWSERBASE_API_KEY,
            projectId: process.env.BROWSERBASE_PROJECT_ID,
            browserbaseSessionCreateParams: {
              browserSettings: {
                ...(browserbaseContext ? { context: browserbaseContext } : {}),
                solveCaptchas,
                blockAds,
                ...(captchaImageSelector ? { captchaImageSelector } : {}),
                ...(captchaInputSelector ? { captchaInputSelector } : {}),
              },
              proxies,
            },
          }
        : {}),
    });

    await raw.init();

    // Browserbase emits CAPTCHA lifecycle events via page console logs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = (raw as any)?.context?.activePage?.();
    if (page?.on) {
      page.on("console", (msg: { text: () => string }) => {
        const text = msg.text();
        if (text === "browserbase-solving-started") {
          devLog.info("stagehand", "CAPTCHA solving started");
        } else if (text === "browserbase-solving-finished") {
          devLog.info("stagehand", "CAPTCHA solving finished");
        }
      });
    }
    done({ success: true });

    // Wrap with logging proxy
    const stagehand = withLogging(raw);

    globalRef.__stagehand = stagehand;
    globalRef.__stagehandInit = undefined;
    return stagehand;
  })();

  return globalRef.__stagehandInit;
}

export async function closeStagehand(): Promise<void> {
  if (globalRef.__stagehand) {
    devLog.info("stagehand", "Closing Stagehand session");
    await globalRef.__stagehand.close();
    globalRef.__stagehand = undefined;
  }
}
