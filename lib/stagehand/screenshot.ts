import type { BoundingBox } from "@/components/providers/GideonProvider";
import { promises as fs } from "fs";
import path from "path";

interface ScreenshotCache {
  screenshot: string | null; // base64 JPEG
  boundingBoxes: BoundingBox[];
  timestamp: number;
}

const CACHE_DIR = path.join(process.cwd(), ".gideon-cache");
const CACHE_FILE = path.join(CACHE_DIR, "latest-screenshot.json");

export function setLatestScreenshot(
  base64: string,
  boundingBoxes: BoundingBox[] = []
): void {
  const data: ScreenshotCache = {
    screenshot: base64,
    boundingBoxes,
    timestamp: Date.now(),
  };

  console.log(`[Screenshot] Saving screenshot (${Math.round(base64.length / 1024)}KB) at ${new Date().toISOString()}`);

  // Write synchronously-ish: fire and forget but log errors
  fs.mkdir(CACHE_DIR, { recursive: true })
    .then(() => fs.writeFile(CACHE_FILE, JSON.stringify(data), "utf-8"))
    .then(() => console.log("[Screenshot] Saved to disk"))
    .catch((err) => console.error("[Screenshot] Failed to save:", err));
}

export async function getLatestScreenshot(): Promise<ScreenshotCache> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ScreenshotCache;
    return {
      screenshot: parsed.screenshot ?? null,
      boundingBoxes: parsed.boundingBoxes ?? [],
      timestamp: parsed.timestamp ?? 0,
    };
  } catch {
    return { screenshot: null, boundingBoxes: [], timestamp: 0 };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function captureScreenshot(page: any): Promise<string> {
  console.log(`[Screenshot] Capturing from ${page.url()}`);
  const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
  const base64 = Buffer.from(buffer).toString("base64");
  setLatestScreenshot(base64);
  return base64;
}
