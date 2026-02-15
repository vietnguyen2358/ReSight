import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const CONTEXT_PATH = join(process.cwd(), "lib/context/user_context.json");

export function readUserContext(): Record<string, unknown> {
  try {
    const raw = readFileSync(CONTEXT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function writeUserContext(data: Record<string, unknown>): void {
  const existing = readUserContext();
  const merged = { ...existing, ...data };
  writeFileSync(CONTEXT_PATH, JSON.stringify(merged, null, 2), "utf-8");
}

export function getUserContextValue(key: string): unknown {
  const ctx = readUserContext();
  return ctx[key] ?? null;
}

export function setUserContextValue(key: string, value: unknown): void {
  writeUserContext({ [key]: value });
}

export function removeUserContextKey(key: string): void {
  const ctx = readUserContext();
  if (!(key in ctx)) return;
  const next = { ...ctx };
  delete next[key];
  writeFileSync(CONTEXT_PATH, JSON.stringify(next, null, 2), "utf-8");
}
