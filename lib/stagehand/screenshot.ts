import type { BoundingBox } from "@/components/providers/GideonProvider";

interface ScreenshotCache {
  screenshot: string | null; // base64 JPEG
  boundingBoxes: BoundingBox[];
  timestamp: number;
}

const cache: ScreenshotCache = {
  screenshot: null,
  boundingBoxes: [],
  timestamp: 0,
};

export function setLatestScreenshot(
  base64: string,
  boundingBoxes: BoundingBox[] = []
): void {
  cache.screenshot = base64;
  cache.boundingBoxes = boundingBoxes;
  cache.timestamp = Date.now();
}

export function getLatestScreenshot(): ScreenshotCache {
  return { ...cache };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function captureScreenshot(page: any): Promise<string> {
  const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
  const base64 = Buffer.from(buffer).toString("base64");
  setLatestScreenshot(base64);
  return base64;
}
