// Clarification module — globalThis promise bridge for ask_user tool
// Navigator blocks on askQuestion(), UI resolves via answerQuestion()

interface PendingQuestion {
  question: string;
  options?: string[];
  resolve: (answer: string) => void;
}

const g = globalThis as unknown as {
  __resitePending?: PendingQuestion;
};

const TIMEOUT_MS = 30_000;

export function askQuestion(
  question: string,
  options?: string[]
): Promise<string> {
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      g.__resitePending = undefined;
      resolve("no response");
    }, TIMEOUT_MS);

    g.__resitePending = {
      question,
      options,
      resolve: (answer: string) => {
        clearTimeout(timer);
        g.__resitePending = undefined;
        resolve(answer);
      },
    };
  });
}

export function answerQuestion(answer: string): boolean {
  if (g.__resitePending) {
    g.__resitePending.resolve(answer);
    return true;
  }
  return false;
}

export function getPendingQuestion(): {
  question: string;
  options?: string[];
} | null {
  if (!g.__resitePending) return null;
  return {
    question: g.__resitePending.question,
    options: g.__resitePending.options,
  };
}

export function hasPendingQuestion(): boolean {
  return g.__resitePending !== undefined;
}
