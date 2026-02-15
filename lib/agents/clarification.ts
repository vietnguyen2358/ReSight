// Clarification module — globalThis promise bridge for ask_user tool
// Navigator blocks on askQuestion(), UI resolves via answerQuestion()

interface PendingQuestion {
  question: string;
  options?: string[];
  resolve: (answer: string) => void;
}

const g = globalThis as unknown as {
  __resightPending?: PendingQuestion;
};

const TIMEOUT_MS = 30_000;

export function askQuestion(
  question: string,
  options?: string[]
): Promise<string> {
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      g.__resightPending = undefined;
      resolve("no response");
    }, TIMEOUT_MS);

    g.__resightPending = {
      question,
      options,
      resolve: (answer: string) => {
        clearTimeout(timer);
        g.__resightPending = undefined;
        resolve(answer);
      },
    };
  });
}

export function answerQuestion(answer: string): boolean {
  if (g.__resightPending) {
    g.__resightPending.resolve(answer);
    return true;
  }
  return false;
}

export function getPendingQuestion(): {
  question: string;
  options?: string[];
} | null {
  if (!g.__resightPending) return null;
  return {
    question: g.__resightPending.question,
    options: g.__resightPending.options,
  };
}

export function hasPendingQuestion(): boolean {
  return g.__resightPending !== undefined;
}
