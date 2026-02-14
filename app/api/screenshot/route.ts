import { NextResponse } from "next/server";
import { getLatestScreenshot } from "@/lib/stagehand/screenshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getLatestScreenshot();

  return NextResponse.json(
    {
      screenshot: data.screenshot,
      boundingBoxes: data.boundingBoxes,
      timestamp: data.timestamp,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}
