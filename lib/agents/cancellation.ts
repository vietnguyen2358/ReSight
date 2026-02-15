// Cancellation module — globalThis-based abort flag + controller tracking
// Survives Next.js hot reloads via globalThis

const g = globalThis as unknown as {
  __resightAbort?: boolean;
  __resightLastUrl?: string;
  __resightNavigatorController?: AbortController;
  __resightOrchestratorController?: AbortController;
};

export function requestAbort(): void {
  g.__resightAbort = true;
}

export function clearAbort(): void {
  g.__resightAbort = false;
}

export function isAborted(): boolean {
  return g.__resightAbort === true;
}

export function setLastUrl(url: string): void {
  g.__resightLastUrl = url;
}

export function getLastUrl(): string | null {
  return g.__resightLastUrl ?? null;
}

// ── Navigator controller ──

export function registerNavigatorController(controller: AbortController): void {
  g.__resightNavigatorController = controller;
}

export function clearNavigatorController(): void {
  g.__resightNavigatorController = undefined;
}

// ── Orchestrator controller ──

export function registerOrchestratorController(controller: AbortController): void {
  g.__resightOrchestratorController = controller;
}

export function clearOrchestratorController(): void {
  g.__resightOrchestratorController = undefined;
}

/**
 * Abort the entire active task chain — both orchestrator and navigator.
 * Directly calls .abort() on their AbortControllers, killing any running
 * generateText loops immediately.
 */
export function abortActiveTask(): void {
  g.__resightAbort = true;
  if (g.__resightNavigatorController) {
    try { g.__resightNavigatorController.abort(); } catch { /* ignore */ }
    g.__resightNavigatorController = undefined;
  }
  if (g.__resightOrchestratorController) {
    try { g.__resightOrchestratorController.abort(); } catch { /* ignore */ }
    g.__resightOrchestratorController = undefined;
  }
}
