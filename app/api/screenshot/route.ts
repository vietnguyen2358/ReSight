import { NextResponse } from "next/server";
import { getLatestScreenshot } from "@/lib/stagehand/screenshot";

export async function GET() {
  const data = getLatestScreenshot();

  return NextResponse.json({
    screenshot: data.screenshot,
    boundingBoxes: data.boundingBoxes,
    timestamp: data.timestamp,
  });
}
