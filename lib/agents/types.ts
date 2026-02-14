export interface ThoughtEvent {
  agent: string;
  message: string;
  timestamp: number;
}

export type SendThoughtFn = (agent: string, message: string) => void;

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
