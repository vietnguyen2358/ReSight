import { NextRequest, NextResponse } from "next/server";
import {
  transcribeAudio,
  GroqTimeoutError,
  GroqRateLimitError,
} from "@/lib/voice/transcribe";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio");

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio field" }, { status: 400 });
    }

    const { text, durationMs } = await transcribeAudio(audio);
    return NextResponse.json({ text, durationMs });
  } catch (err) {
    if (err instanceof GroqTimeoutError) {
      return NextResponse.json({ error: "Transcription timed out" }, { status: 504 });
    }
    if (err instanceof GroqRateLimitError) {
      return NextResponse.json({ error: "Rate limited, try again shortly" }, { status: 429 });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
