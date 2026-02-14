import { EventEmitter } from "events";

export type LogCategory =
  | "stagehand"    // act, observe, extract, init
  | "llm"          // AI SDK generateText calls (orchestrator, navigator)
  | "navigation"   // page.goto, URL changes, screenshots
  | "orchestrator"  // high-level orchestrator flow
  | "navigator"     // navigator tool dispatch
  | "error";        // errors anywhere

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface DevLogEntry {
  id: number;
  timestamp: number;
  category: LogCategory;
  level: LogLevel;
  title: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

class DevLogger extends EventEmitter {
  private logs: DevLogEntry[] = [];
  private maxLogs = 500;
  private idCounter = 0;

  log(
    category: LogCategory,
    level: LogLevel,
    title: string,
    data?: Record<string, unknown>,
    durationMs?: number
  ): DevLogEntry {
    const entry: DevLogEntry = {
      id: ++this.idCounter,
      timestamp: Date.now(),
      category,
      level,
      title,
      data,
      durationMs,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also console.log with a prefix for the server terminal
    const prefix = `[DEV:${category.toUpperCase()}]`;
    const dur = durationMs != null ? ` (${durationMs}ms)` : "";
    console.log(`${prefix} ${title}${dur}`);
    if (data && level !== "debug") {
      const serialized = JSON.stringify(data, null, 2);
      if (serialized.length < 2000) {
        console.log(`${prefix}   ↳`, serialized);
      } else {
        console.log(`${prefix}   ↳`, serialized.substring(0, 2000) + "...[truncated]");
      }
    }

    this.emit("log", entry);
    return entry;
  }

  info(category: LogCategory, title: string, data?: Record<string, unknown>) {
    return this.log(category, "info", title, data);
  }

  warn(category: LogCategory, title: string, data?: Record<string, unknown>) {
    return this.log(category, "warn", title, data);
  }

  error(category: LogCategory, title: string, data?: Record<string, unknown>) {
    return this.log(category, "error", title, data);
  }

  debug(category: LogCategory, title: string, data?: Record<string, unknown>) {
    return this.log(category, "debug", title, data);
  }

  /** Start a timer, returns a function to call when done */
  time(category: LogCategory, title: string, data?: Record<string, unknown>) {
    const start = performance.now();
    return (resultData?: Record<string, unknown>, level: LogLevel = "info") => {
      const durationMs = Math.round(performance.now() - start);
      return this.log(category, level, title, { ...data, ...resultData }, durationMs);
    };
  }

  getHistory(): DevLogEntry[] {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
  }
}

const devLog = new DevLogger();
devLog.setMaxListeners(50);

export { devLog };
