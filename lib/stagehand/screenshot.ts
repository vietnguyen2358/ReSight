import type { BoundingBox } from "@/components/providers/GideonProvider";
import { promises as fs } from "fs";
import path from "path";
import { devLog } from "@/lib/dev-logger";

interface ScreenshotCache {
  screenshot: string | null; // base64 JPEG
  boundingBoxes: BoundingBox[];
  timestamp: number;
}

const CACHE_DIR = path.join(process.cwd(), ".resight-cache");
const CACHE_FILE = path.join(CACHE_DIR, "latest-screenshot.json");

// In-memory cache — updated synchronously so API polls never read stale data.
// Survives Next.js hot reloads via globalThis (same pattern as other singletons).
const EMPTY: ScreenshotCache = { screenshot: null, boundingBoxes: [], timestamp: 0 };
const g = globalThis as unknown as { __resight_screenshot_cache?: ScreenshotCache };
if (!g.__resight_screenshot_cache) g.__resight_screenshot_cache = EMPTY;

export function setLatestScreenshot(
  base64: string,
  boundingBoxes: BoundingBox[] = []
): void {
  const data: ScreenshotCache = {
    screenshot: base64,
    boundingBoxes,
    timestamp: Date.now(),
  };

  // Update memory immediately — this is what the API route reads
  g.__resight_screenshot_cache = data;

  devLog.debug("navigation", `Caching screenshot (${Math.round(base64.length / 1024)}KB)`);

  // Also persist to file (fire and forget, for crash recovery)
  fs.mkdir(CACHE_DIR, { recursive: true })
    .then(() => fs.writeFile(CACHE_FILE, JSON.stringify(data), "utf-8"))
    .catch((err) => devLog.error("navigation", `Failed to save: ${err}`));
}

export async function getLatestScreenshot(): Promise<ScreenshotCache> {
  // Prefer in-memory cache (always up-to-date, no I/O)
  if (g.__resight_screenshot_cache && g.__resight_screenshot_cache.screenshot) {
    return g.__resight_screenshot_cache;
  }

  // Fallback to file (e.g. after server restart before first screenshot)
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as ScreenshotCache;
    const result: ScreenshotCache = {
      screenshot: parsed.screenshot ?? null,
      boundingBoxes: parsed.boundingBoxes ?? [],
      timestamp: parsed.timestamp ?? 0,
    };
    // Hydrate memory so subsequent reads skip file I/O
    g.__resight_screenshot_cache = result;
    return result;
  } catch {
    return EMPTY;
  }
}
