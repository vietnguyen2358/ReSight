export class GroqTimeoutError extends Error {
  constructor() {
    super("Groq transcription timed out");
    this.name = "GroqTimeoutError";
  }
}

export class GroqRateLimitError extends Error {
  constructor() {
    super("Groq rate limit exceeded");
    this.name = "GroqRateLimitError";
  }
}

export async function transcribeAudio(
  audioBlob: Blob,
  options?: { language?: string; timeoutMs?: number }
): Promise<{ text: string; durationMs: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  const timeoutMs = options?.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");

  formData.append("model", "whisper-large-v3");
  if (options?.language) formData.append("language", options.language);

  const start = Date.now();

  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: controller.signal,
    });

    if (res.status === 429) throw new GroqRateLimitError();
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Groq API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    return { text: (data.text || "").trim(), durationMs: Date.now() - start };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new GroqTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
