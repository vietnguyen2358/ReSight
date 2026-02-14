import { Stagehand } from "@browserbasehq/stagehand";

let instance: Stagehand | null = null;
let initializing: Promise<Stagehand> | null = null;

export async function getStagehand(): Promise<Stagehand> {
  if (instance) return instance;

  // Deduplicate concurrent init calls
  if (initializing) return initializing;

  initializing = (async () => {
    const env = (process.env.STAGEHAND_ENV as "LOCAL" | "BROWSERBASE") || "LOCAL";
    const googleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const openrouterApiKey = process.env.OPENROUTER_API_KEY;

    // Determine model config: prefer Google, fall back to OpenRouter
    let modelConfig: Record<string, unknown> = {};
    if (googleApiKey) {
      modelConfig = {
        model: {
          modelName: "gemini-2.0-flash",
          apiKey: googleApiKey,
        },
      };
    } else if (openrouterApiKey) {
      modelConfig = {
        model: {
          modelName: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
          apiKey: openrouterApiKey,
          clientOptions: {
            baseURL: "https://openrouter.ai/api/v1",
          },
        },
      };
    }

    console.log(`[Stagehand] Initializing in ${env} mode with ${googleApiKey ? "Gemini" : openrouterApiKey ? "OpenRouter" : "no model"}`);

    const stagehand = new Stagehand({
      env,
      ...modelConfig,
      ...(env === "BROWSERBASE"
        ? {
            apiKey: process.env.BROWSERBASE_API_KEY,
            projectId: process.env.BROWSERBASE_PROJECT_ID,
          }
        : {}),
    });

    await stagehand.init();
    instance = stagehand;
    initializing = null;
    return stagehand;
  })();

  return initializing;
}

export async function closeStagehand(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
