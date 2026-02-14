import { Stagehand } from "@browserbasehq/stagehand";
import { devLog } from "@/lib/dev-logger";

let instance: Stagehand | null = null;
let initializing: Promise<Stagehand> | null = null;

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
  if (instance) return instance;

  // Deduplicate concurrent init calls
  if (initializing) return initializing;

  initializing = (async () => {
    const env = (process.env.STAGEHAND_ENV as "LOCAL" | "BROWSERBASE") || "LOCAL";
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    // Stagehand MUST use Google Gemini — its observe/extract calls don't support
    // custom baseURLs, so OpenRouter/other providers won't work here.
    // OpenRouter is used only for AI SDK agent calls (orchestrator/navigator LLM).
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
      browserbase: env === "BROWSERBASE",
    });

    const done = devLog.time("stagehand", "Stagehand init");

    const raw = new Stagehand({
      env,
      model: {
        modelName: "gemini-2.0-flash",
        apiKey: googleApiKey,
      },
      ...(env === "BROWSERBASE"
        ? {
            apiKey: process.env.BROWSERBASE_API_KEY,
            projectId: process.env.BROWSERBASE_PROJECT_ID,
          }
        : {}),
    });

    await raw.init();
    done({ success: true });

    // Wrap with logging proxy
    const stagehand = withLogging(raw);

    instance = stagehand;
    initializing = null;
    return stagehand;
  })();

  return initializing;
}

export async function closeStagehand(): Promise<void> {
  if (instance) {
    devLog.info("stagehand", "Closing Stagehand session");
    await instance.close();
    instance = null;
  }
}
