import { NextRequest, NextResponse } from "next/server";
import { generateSpeech, TTSTimeoutError, getTTSProvider } from "@/lib/voice/tts";

/** Strip markdown and other artifacts that sound bad when spoken aloud. */
function polishForVoice(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")    // bold
    .replace(/\*(.+?)\*/g, "$1")         // italic
    .replace(/`(.+?)`/g, "$1")           // inline code
    .replace(/#{1,6}\s*/g, "")           // headings
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")  // links → link text only
    .replace(/\n{2,}/g, ". ")            // double newlines → pause
    .replace(/\n/g, " ")                 // single newlines → space
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text field" }, { status: 400 });
    }

    const provider = getTTSProvider();
    console.log(`[TTS] Using ${provider}`);

    const polished = polishForVoice(text);
    const { audio, contentType } = await generateSpeech(polished);

    return new NextResponse(audio, {
      status: 200,
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    if (err instanceof TTSTimeoutError) {
      return NextResponse.json({ error: "TTS timed out" }, { status: 504 });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
