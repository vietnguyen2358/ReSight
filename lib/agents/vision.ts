import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { devLog } from "@/lib/dev-logger";

/**
 * Send a screenshot to Gemini 2.0 Flash vision and get a vivid but brief
 * visual description (colors, layout, imagery, mood). Returns "" on error.
 */
export async function describeScreenshot(
  base64: string,
  taskContext?: string
): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey || !base64) return "";

  const timer = devLog.time("navigation", "describeScreenshot");

  try {
    const contextHint = taskContext
      ? ` The user is trying to: ${taskContext}.`
      : "";

    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      maxOutputTokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              image: base64,
            },
            {
              type: "text",
              text: `You are describing a webpage screenshot to a blind user. Give a vivid but brief (2-4 sentences) description of the VISUAL experience — colors, layout style, imagery, branding feel, and overall mood/vibe. Do NOT list text content, prices, or navigation items — another system handles that. Focus on what a sighted person would FEEL looking at this page.${contextHint}`,
            },
          ],
        },
      ],
    });

    timer({ success: true, length: text?.length ?? 0 });
    return text?.trim() || "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    timer({ success: false, error: msg }, "warn");
    devLog.warn("navigation", `describeScreenshot failed: ${msg}`);
    return "";
  }
}
