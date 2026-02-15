// Cancellation module — globalThis-based abort flag + controller tracking
// Survives Next.js hot reloads via globalThis

const g = globalThis as unknown as {
  __resiteAbort?: boolean;
  __resiteLastUrl?: string;
  __resiteNavigatorController?: AbortController;
  __resiteOrchestratorController?: AbortController;
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

// ── Navigator controller ──

export function registerNavigatorController(controller: AbortController): void {
  g.__resiteNavigatorController = controller;
}

export function clearNavigatorController(): void {
  g.__resiteNavigatorController = undefined;
}

// ── Orchestrator controller ──

export function registerOrchestratorController(controller: AbortController): void {
  g.__resiteOrchestratorController = controller;
}

export function clearOrchestratorController(): void {
  g.__resiteOrchestratorController = undefined;
}

/**
 * Abort the entire active task chain — both orchestrator and navigator.
 * Directly calls .abort() on their AbortControllers, killing any running
 * generateText loops immediately.
 */
export function abortActiveTask(): void {
  g.__resiteAbort = true;
  if (g.__resiteNavigatorController) {
    try { g.__resiteNavigatorController.abort(); } catch { /* ignore */ }
    g.__resiteNavigatorController = undefined;
  }
  if (g.__resiteOrchestratorController) {
    try { g.__resiteOrchestratorController.abort(); } catch { /* ignore */ }
    g.__resiteOrchestratorController = undefined;
  }
}
