import {
  readUserContext,
  setUserContextValue,
} from "@/lib/context/user-context";
import type { SendThoughtFn, AgentResult } from "./types";

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
      return {
        success: true,
        message: `Remembered: ${key} = "${value}"`,
      };
    } else if (action === "recall") {
      const context = readUserContext();
      const found = context[key];
      if (found !== undefined) {
        sendThought("Scribe", `Found: ${key} = "${found}"`);
        return {
          success: true,
          message: `${key}: ${JSON.stringify(found)}`,
          data: { [key]: found },
        };
      } else {
        sendThought("Scribe", `No memory found for "${key}"`);
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
  } else {
    sendThought("Scribe", "No stored preferences yet");
  }
  return ctx;
}
