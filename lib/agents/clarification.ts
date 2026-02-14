// Clarification module — globalThis promise bridge for ask_user tool
// Navigator blocks on askQuestion(), UI resolves via answerQuestion()

interface PendingQuestion {
  question: string;
  options?: string[];
  resolve: (answer: string) => void;
}

const g = globalThis as unknown as {
  __gideonPending?: PendingQuestion;
};

const TIMEOUT_MS = 30_000;

export function askQuestion(
  question: string,
  options?: string[]
): Promise<string> {
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      g.__gideonPending = undefined;
      resolve("no response");
    }, TIMEOUT_MS);

    g.__gideonPending = {
      question,
      options,
      resolve: (answer: string) => {
        clearTimeout(timer);
        g.__gideonPending = undefined;
        resolve(answer);
      },
    };
  });
}

export function answerQuestion(answer: string): boolean {
  if (g.__gideonPending) {
    g.__gideonPending.resolve(answer);
    return true;
  }
  return false;
}

export function getPendingQuestion(): {
  question: string;
  options?: string[];
} | null {
  if (!g.__gideonPending) return null;
  return {
    question: g.__gideonPending.question,
    options: g.__gideonPending.options,
  };
}

export function hasPendingQuestion(): boolean {
  return g.__gideonPending !== undefined;
}
