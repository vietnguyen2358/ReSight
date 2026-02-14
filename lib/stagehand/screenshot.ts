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

const cache: ScreenshotCache = {
  screenshot: null,
  boundingBoxes: [],
  timestamp: 0,
};

let hydrated = false;

async function persistCacheToDisk(data: ScreenshotCache): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(data), "utf-8");
  } catch {
    // Ignore persistence failures; in-memory cache still works.
  }
}

async function hydrateCacheFromDisk(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ScreenshotCache;
    if (parsed && typeof parsed.timestamp === "number" && parsed.timestamp > cache.timestamp) {
      cache.screenshot = parsed.screenshot;
      cache.boundingBoxes = parsed.boundingBoxes || [];
      cache.timestamp = parsed.timestamp;
    }
  } catch {
    // No disk cache yet.
  }
}

export function setLatestScreenshot(
  base64: string,
  boundingBoxes: BoundingBox[] = []
): void {
  cache.screenshot = base64;
  cache.boundingBoxes = boundingBoxes;
  cache.timestamp = Date.now();

  void persistCacheToDisk(cache);
}

export async function getLatestScreenshot(): Promise<ScreenshotCache> {
  await hydrateCacheFromDisk();
  return { ...cache };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function captureScreenshot(page: any): Promise<string> {
  const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
  const base64 = Buffer.from(buffer).toString("base64");
  setLatestScreenshot(base64);
  return base64;
}
