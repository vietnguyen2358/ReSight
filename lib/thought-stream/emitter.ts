import { EventEmitter } from "events";

export interface ThoughtEvent {
  agent: string;
  message: string;
  timestamp: number;
}

class ThoughtEmitter extends EventEmitter {
  private history: ThoughtEvent[] = [];
  private maxHistory = 100;

  emit(event: "thought", data: ThoughtEvent): boolean;
  emit(event: string, ...args: unknown[]): boolean {
    if (event === "thought") {
      const data = args[0] as ThoughtEvent;
      this.history.push(data);
      if (this.history.length > this.maxHistory) {
        this.history = this.history.slice(-this.maxHistory);
      }
    }
    return super.emit(event, ...args);
  }

  getHistory(): ThoughtEvent[] {
    return [...this.history];
  }

  sendThought(agent: string, message: string): void {
    this.emit("thought", { agent, message, timestamp: Date.now() });
  }
}

// Store on globalThis to survive Next.js hot reloads in dev mode.
// Without this, every file save creates a new ThoughtEmitter instance,
// breaking SSE subscriptions (the route listens on the old instance
// while agents emit on the new one → zero thoughts reach the frontend).
const globalRef = globalThis as unknown as { __thoughtEmitter?: ThoughtEmitter };

if (!globalRef.__thoughtEmitter) {
  globalRef.__thoughtEmitter = new ThoughtEmitter();
  globalRef.__thoughtEmitter.setMaxListeners(50);
}

const thoughtEmitter = globalRef.__thoughtEmitter;

export { thoughtEmitter };
