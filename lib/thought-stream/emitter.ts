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

// Module-level singleton
const thoughtEmitter = new ThoughtEmitter();
thoughtEmitter.setMaxListeners(50);

export { thoughtEmitter };
