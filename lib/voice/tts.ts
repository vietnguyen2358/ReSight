export class TTSTimeoutError extends Error {
  constructor(provider: string) {
    super(`${provider} TTS timed out`);
    this.name = "TTSTimeoutError";
  }
}

// Keep old name as alias for backwards compat in route handler
export const DeepgramTimeoutError = TTSTimeoutError;

/** Returns which TTS provider is active based on env vars. */
export function getTTSProvider(): "elevenlabs" | "deepgram" {
  return process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "deepgram";
}

// ── ElevenLabs TTS ──────────────────────────────────────────────────

async function generateSpeechElevenLabs(
  text: string,
  options?: { voiceId?: string; model?: string; timeoutMs?: number }
): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const voiceId = options?.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";
  const model = options?.model ?? "eleven_turbo_v2_5";
  const timeoutMs = options?.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ElevenLabs API error ${res.status}: ${body}`);
    }

    const audio = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "audio/mpeg";
    return { audio, contentType };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new TTSTimeoutError("ElevenLabs");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Deepgram TTS ────────────────────────────────────────────────────

async function generateSpeechDeepgram(
  text: string,
  options?: { model?: string; timeoutMs?: number }
): Promise<{ audio: ArrayBuffer; contentType: string }> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set");

  const model = options?.model ?? "aura-asteria-en";
  const timeoutMs = options?.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Deepgram API error ${res.status}: ${body}`);
    }

    const audio = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "audio/mpeg";
    return { audio, contentType };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new TTSTimeoutError("Deepgram");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ──────────────────────────────────────────────────────

/** Auto-selects ElevenLabs if key is set, otherwise Deepgram. */
export async function generateSpeech(
  text: string,
  options?: { model?: string; voiceId?: string; timeoutMs?: number }
): Promise<{ audio: ArrayBuffer; contentType: string }> {
  if (process.env.ELEVENLABS_API_KEY) {
    return generateSpeechElevenLabs(text, options);
  }
  return generateSpeechDeepgram(text, options);
}
