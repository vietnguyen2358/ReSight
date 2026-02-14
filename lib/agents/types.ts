export type ThoughtType = "thinking" | "answer";

export interface ThoughtEvent {
  agent: string;
  message: string;
  timestamp: number;
  type?: ThoughtType;
}

export type SendThoughtFn = (agent: string, message: string, type?: ThoughtType) => void;

export interface AgentResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  confirmationRequired?: boolean;
}

export interface NavigatorAction {
  instruction: string;
  context?: Record<string, unknown>;
}
