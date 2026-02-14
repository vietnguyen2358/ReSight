// Cancellation module — globalThis-based abort flag + URL tracking
// Survives Next.js hot reloads via globalThis

const g = globalThis as unknown as {
  __gideonAbort?: boolean;
  __gideonLastUrl?: string;
};

export function requestAbort(): void {
  g.__gideonAbort = true;
}

export function clearAbort(): void {
  g.__gideonAbort = false;
}

export function isAborted(): boolean {
  return g.__gideonAbort === true;
}

export function setLastUrl(url: string): void {
  g.__gideonLastUrl = url;
}

export function getLastUrl(): string | null {
  return g.__gideonLastUrl ?? null;
}
