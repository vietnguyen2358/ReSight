/**
 * Fast-path planner: regex pattern matching → deterministic execution plans.
 * No LLM calls — pure TypeScript.
 */

export interface ExecutionPlan {
  steps: string[];
  reasoning: string;
}

/**
 * Try to match the instruction to a known pattern and return a deterministic plan.
 * Returns null if no pattern matches (LLM should use create_plan tool instead).
 */
export function generateFastPathPlan(instruction: string): ExecutionPlan | null {
  const lower = instruction.toLowerCase().trim();

  // ── Direct URL ──
  const urlMatch = instruction.match(/\bhttps?:\/\/[^\s]+/i);
  if (urlMatch) {
    const url = urlMatch[0];
    return {
      reasoning: `User provided a direct URL: ${url}`,
      steps: [
        `goto_url("${url}")`,
        `narrate what the page looks like`,
        `extract_info("key content on this page relevant to: ${instruction}")`,
        `done with a conversational summary`,
      ],
    };
  }

  // ── YouTube: creator videos (@handle or "videos from/by X") ──
  const ytHandleMatch = instruction.match(/@([\w.-]+)/);
  if (ytHandleMatch) {
    const handle = ytHandleMatch[1];
    return {
      reasoning: `YouTube creator handle detected: @${handle}`,
      steps: [
        `goto_url("https://www.youtube.com/@${handle}/videos")`,
        `narrate the channel page and recent videos`,
        `extract_info("List the most recent videos with titles and upload dates")`,
        `done with a conversational summary of the videos`,
      ],
    };
  }

  const ytCreatorMatch = lower.match(
    /(?:videos?|uploads?|latest|newest|recent)\s+(?:from|by|of|uploaded by|on)\s+(\w[\w\s]{1,30})/
  );
  if (ytCreatorMatch && (lower.includes("youtube") || lower.includes("video"))) {
    const creator = ytCreatorMatch[1].trim().replace(/\s+/g, "");
    return {
      reasoning: `YouTube creator search: ${creator}`,
      steps: [
        `goto_url("https://www.youtube.com/@${creator}/videos")`,
        `narrate the channel page and recent videos`,
        `extract_info("List the most recent videos with titles and upload dates")`,
        `done with a conversational summary of the videos`,
      ],
    };
  }

  // ── YouTube: topic search ──
  if (lower.includes("youtube") || (lower.includes("video") && !lower.includes("by "))) {
    const query = lower
      .replace(/\b(search|find|look|for|on|youtube|videos?|show|me|the|watch)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (query.length > 2) {
      return {
        reasoning: `YouTube topic search: ${query}`,
        steps: [
          `goto_url("https://www.youtube.com/results?search_query=${encodeURIComponent(query)}")`,
          `narrate the search results`,
          `extract_info("List the top video results with titles, channels, and view counts")`,
          `done with a conversational summary`,
        ],
      };
    }
  }

  // ── Shopping: Amazon / Target / Walmart ──
  const shoppingSites: Record<string, string> = {
    amazon: "https://www.amazon.com/s?k=",
    target: "https://www.target.com/s?searchTerm=",
    walmart: "https://www.walmart.com/search?q=",
  };
  for (const [site, baseUrl] of Object.entries(shoppingSites)) {
    if (lower.includes(site)) {
      const query = lower
        .replace(new RegExp(`\\b(search|find|look|for|on|${site}|'s|show|me|the|get|buy|price|of)\\b`, "g"), "")
        .replace(/\s+/g, " ")
        .trim();
      if (query.length > 1) {
        return {
          reasoning: `Shopping search on ${site}: ${query}`,
          steps: [
            `goto_url("${baseUrl}${encodeURIComponent(query)}")`,
            `narrate the search results page — product names, prices, ratings`,
            `extract_info("List the top products with names, prices, and ratings")`,
            `done with a conversational summary of the products found`,
          ],
        };
      }
    }
  }

  // ── Multi-step: "find best X and get Y" ──
  const multiStepMatch = lower.match(
    /(?:find|search|get|look)\s+(?:the\s+)?best\s+(.+?)\s+(?:and|then)\s+(?:get|find|show|check|tell)\s+(?:me\s+)?(?:the\s+)?(.+)/
  );
  if (multiStepMatch) {
    const topic = multiStepMatch[1].trim();
    const detail = multiStepMatch[2].trim();
    return {
      reasoning: `Multi-step: find best ${topic}, then get ${detail}`,
      steps: [
        `goto_url("https://www.google.com/search?q=${encodeURIComponent(`best ${topic}`)}")`,
        `narrate the Google search results`,
        `extract_info("What is the top-recommended result for best ${topic}?")`,
        `goto_url to the top result's website`,
        `narrate what the page looks like`,
        `extract_info("${detail}")`,
        `done with a summary of the best ${topic} and ${detail}`,
      ],
    };
  }

  // ── General search (fallback for search/find/google keywords) ──
  const searchMatch = lower.match(
    /(?:search|google|find|look up|look for|what'?s|what is|who is|where is|how to|how do)\s+(.+)/
  );
  if (searchMatch) {
    const query = searchMatch[1]
      .replace(/\b(on google|on the web|online|for me|please)\b/g, "")
      .trim();
    if (query.length > 2) {
      return {
        reasoning: `General search: ${query}`,
        steps: [
          `goto_url("https://www.google.com/search?q=${encodeURIComponent(query)}")`,
          `narrate the top search results`,
          `extract_info("Summarize the most relevant information about: ${query}")`,
          `done with a conversational summary`,
        ],
      };
    }
  }

  // No pattern matched — LLM will use create_plan tool
  return null;
}

/**
 * Format a plan as a numbered string for injection into the navigator prompt.
 */
export function formatPlanForPrompt(plan: ExecutionPlan): string {
  const numbered = plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `EXECUTION PLAN (${plan.steps.length} steps — follow in order, adapt if needed):\n${numbered}`;
}
