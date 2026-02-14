// Cancellation module — globalThis-based abort flag + URL tracking
// Survives Next.js hot reloads via globalThis

const g = globalThis as unknown as {
  __resiteAbort?: boolean;
  __resiteLastUrl?: string;
};

export function requestAbort(): void {
  g.__resiteAbort = true;
}

export function clearAbort(): void {
  g.__resiteAbort = false;
}

export function isAborted(): boolean {
  return g.__resiteAbort === true;
}

export function setLastUrl(url: string): void {
  g.__resiteLastUrl = url;
}

export function getLastUrl(): string | null {
  return g.__resiteLastUrl ?? null;
}
