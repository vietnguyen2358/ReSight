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
    const { text } = await generateText({
      model: google("gemini-2.0-flash"),
      maxOutputTokens: 400,
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
              text: `You are describing a webpage screenshot to a blind user. Be their eyes — tell them what's on screen the way a friend sitting next to them would. 3-5 sentences.

Focus on:
- WHAT HAPPENED: Did something open, change, load? Acknowledge it.
- WHAT'S HERE: The main content — product names, prices, article titles, search results. Be specific with names and numbers you can read.
- WHAT'S AVAILABLE: Key actions they can take — buttons, forms, links, modals. Mention options that aren't obvious from text alone (e.g. a modal they could close, tabs they could switch).
- IMAGES: Briefly note what photos/graphics show if they add context (a product photo, a map, a person).
${taskContext ? `\nThe user is trying to: ${taskContext}. Focus on what's most relevant to their goal.` : ""}

Do NOT over-describe visual design (colors, fonts, whitespace, branding). Do NOT give a bulleted list. Just talk naturally, like telling a friend what you see.`,
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
