import { Stagehand } from "@browserbasehq/stagehand";

let instance: Stagehand | null = null;
let initializing: Promise<Stagehand> | null = null;

export async function getStagehand(): Promise<Stagehand> {
  if (instance) return instance;

  // Deduplicate concurrent init calls
  if (initializing) return initializing;

  initializing = (async () => {
    const env = (process.env.STAGEHAND_ENV as "LOCAL" | "BROWSERBASE") || "LOCAL";

    const stagehand = new Stagehand({
      env,
      model: {
        modelName: "gemini-2.0-flash",
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      },
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
