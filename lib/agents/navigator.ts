import { getStagehand } from "@/lib/stagehand/session";
import { captureScreenshot, setLatestScreenshot } from "@/lib/stagehand/screenshot";
import type { SendThoughtFn, AgentResult } from "./types";

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
