import {
  readUserContext,
  setUserContextValue,
  getUserContextValue,
} from "@/lib/context/user-context";
import type { SendThoughtFn, AgentResult } from "./types";

export interface LearnedFlow {
  pattern: string;
  steps: string;
  timestamp: number;
}

export async function scribeAgent(
  action: "store" | "recall",
  key: string,
  value: string | undefined,
  sendThought: SendThoughtFn
): Promise<AgentResult> {
  sendThought("Scribe", `${action === "store" ? "Storing" : "Recalling"} "${key}"`);

  try {
    if (action === "store" && value !== undefined) {
      setUserContextValue(key, value);
      sendThought("Scribe", `Stored: ${key} = "${value}"`);
      sendThought("Scribe → Orchestrator", `Memory updated: ${key} = "${value}"`);
      return {
        success: true,
        message: `Remembered: ${key} = "${value}"`,
      };
    } else if (action === "recall") {
      const context = readUserContext();
      const found = context[key];
      if (found !== undefined) {
        sendThought("Scribe", `Found: ${key} = "${found}"`);
        sendThought("Scribe → Orchestrator", `Retrieved from memory: ${key} = "${found}"`);
        return {
          success: true,
          message: `${key}: ${JSON.stringify(found)}`,
          data: { [key]: found },
        };
      } else {
        sendThought("Scribe", `No memory found for "${key}"`);
        sendThought("Scribe → Orchestrator", `No stored value for "${key}"`);
        return {
          success: false,
          message: `No stored value for "${key}"`,
        };
      }
    }

    return { success: false, message: "Invalid scribe action" };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    sendThought("Scribe", `Error: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
}

export function getFullContext(sendThought: SendThoughtFn): Record<string, unknown> {
  sendThought("Scribe", "Loading user context...");
  const ctx = readUserContext();
  const keys = Object.keys(ctx);
  if (keys.length > 0) {
    sendThought("Scribe", `Loaded ${keys.length} preferences`);
    sendThought("Scribe → Orchestrator", `User has ${keys.length} stored preferences: ${keys.join(", ")}`);
  } else {
    sendThought("Scribe", "No stored preferences yet");
  }
  return ctx;
}

/**
 * Save a successful navigation pattern so the navigator can learn from it.
 * Called by the orchestrator after a successful navigation completes.
 */
export function saveLearnedFlow(pattern: string, steps: string): void {
  const flows = getLearnedFlows();
  // Don't duplicate — update if pattern already exists
  const existing = flows.findIndex((f) => f.pattern === pattern);
  if (existing >= 0) {
    flows[existing] = { pattern, steps, timestamp: Date.now() };
  } else {
    flows.push({ pattern, steps, timestamp: Date.now() });
  }
  // Keep only the last 20 flows
  const trimmed = flows.slice(-20);
  setUserContextValue("_learned_flows", trimmed);
}

/**
 * Get all learned navigation flows from past sessions.
 */
export function getLearnedFlows(): LearnedFlow[] {
  const raw = getUserContextValue("_learned_flows");
  if (Array.isArray(raw)) return raw as LearnedFlow[];
  return [];
}
