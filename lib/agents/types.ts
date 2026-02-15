export type ThoughtType = "thinking" | "answer";

/** Canonical activity codes — use these instead of pattern-matching message content. */
export type ThoughtActivity =
  | "navigating"
  | "loading"
  | "acting"
  | "extracting"
  | "searching"
  | "verifying"
  | "summarizing";

export interface ThoughtEvent {
  agent: string;
  message: string;
  timestamp: number;
  type?: ThoughtType;
  activity?: ThoughtActivity;
}

export type SendThoughtFn = (
  agent: string,
  message: string,
  type?: ThoughtType,
  activity?: ThoughtActivity
) => void;

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
