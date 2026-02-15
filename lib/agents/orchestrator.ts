import { generateText, tool, stepCountIs } from "ai";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { navigatorAgent } from "./navigator";
import { scribeAgent, getFullContext, cleanupLearnedFlows } from "./scribe";
import { guardianAgent } from "./guardian";
import { thoughtEmitter } from "@/lib/thought-stream/emitter";
import { devLog } from "@/lib/dev-logger";
import { clearAbort, abortActiveTask, registerOrchestratorController, clearOrchestratorController } from "./cancellation";
import { hasPendingQuestion, answerQuestion } from "./clarification";
import { goBack, waitFor, takeScreenshot, getPageTitle, getCurrentUrl } from "@/lib/stagehand/browser";
import type { AgentResult } from "./types";

function getModel() {
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  if (openrouterKey) {
    const modelName = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
    devLog.info("llm", `Orchestrator using OpenRouter: ${modelName}`);
    const openrouter = createOpenAI({
      apiKey: openrouterKey,
      baseURL: "https://openrouter.ai/api/v1",
    });
    return openrouter.chat(modelName);
  }
  if (googleKey) {
    devLog.info("llm", "Orchestrator using Google Gemini: gemini-2.0-flash");
    return google("gemini-2.0-flash");
  }
  throw new Error("No LLM API key configured. Set GOOGLE_GENERATIVE_AI_API_KEY or OPENROUTER_API_KEY.");
}

const ORCHESTRATOR_SYSTEM = `You are ReSight, a chill, friendly voice assistant helping a blind user browse the web. You're their buddy sitting next to them at the computer. Talk like a real person — short, warm, enthusiastic. Your responses are SPOKEN ALOUD so write exactly how you'd talk.

## CRITICAL RULE: ALWAYS CALL navigate
You MUST call the navigate tool for ANY user request that involves the web. NEVER respond with just text asking for clarification — the navigator has its own ask_user tool for that.
- Vague request like "find me a video"? Call navigate IMMEDIATELY. The navigator will figure it out or ask the user.
- "Show me something on YouTube"? Call navigate with the full request. Do NOT ask "what kind of video?"
- The ONLY time you respond without calling navigate is for pure conversation (greetings, thanks, "how are you").
- When in doubt, call navigate. Let the navigator handle ambiguity — that's its job.

## What you can do
1. **navigate** — Any web task. Pass the user's FULL request, including context from the conversation. The navigator does all the browsing. ALWAYS call this for anything web-related.
   - When the user references something from the prior turn ("the post", "that", "it", "the comments", "that one", "this page"), your navigate instruction MUST explicitly state what we're referring to. Include the specific title/URL/name from the prior ReSight response. Example: "We just showed the user the Reddit post 'Am I overreacting: new boyfriend...'. User now asks: what are the comments saying? Navigate to that post and read its comments."
2. **remember** — Store/recall user preferences.
3. **safety_check** — Use when something seems off: suspicious/shortened URLs (bit.ly etc.), unknown sites, sketchy links someone sent the user, unusually cheap deals, download prompts, or pages asking for too much personal info. Do NOT use for normal purchases on known retailers.

## How to talk
- Your response is SPOKEN ALOUD via a voice agent. EVERY WORD COSTS MONEY. Be brief.
- MAX 2 sentences, under 35 words total. This is a hard limit.
- After navigate returns, give a QUICK conversational highlight — don't repeat everything the navigator found. Distill it to the key takeaway.
- Be warm and natural: "Ooh nice!" / "Yeah totally!" / "Found some good stuff!"
- NEVER explain your process. Just say "Lemme check that out."
- NEVER use: "I am now...", "Proceeding to...", "I have found...", "Here is what I found:", "Based on my search..."
- End with something quick: "Want me to grab that?" / "Which one sounds good?"
- No markdown, no formatting, no bullet lists.
- NEVER ask the user to clarify before calling navigate. Just call navigate with whatever they said.

## Purchases & orders
- When the user asks to buy/order something, JUST DO IT. Call navigate immediately.
- Do NOT call safety_check for purchases the user requested — their request IS consent.
- Do NOT ask for confirmation before searching, adding to cart, or checking out.
- Do NOT give disclaimers about payment info, account requirements, or security.
- If you need info (flavor, size), ask in ONE quick question: "What flavor — vanilla, chocolate?" not a long explanation.
- If the user already confirmed in the conversation history, proceed without asking again.

## Current page awareness
- You receive the current browser page URL and title in the prompt. Use this context!
- If the user asks "what page am I on" or "describe this page", call navigate with their request — the navigator can see the page and describe it.
- If the user references "this page" or "this site", you know what they mean from the current page context.

## Conversation history
- You receive prior messages. Use them! If the user said "vanilla, 1 pound" earlier, remember that.
- NEVER ask for information the user already provided.
- If the user says "yes" or "go ahead", they're confirming the last thing discussed — don't ask what they mean.`;

function sendThought(
  agent: string,
  message: string,
  type?: "thinking" | "answer",
  activity?: import("./types").ThoughtActivity
) {
  thoughtEmitter.sendThought(agent, message, type, activity);
}

/** Strip markdown/bullets/formatting so the response sounds natural when spoken aloud */
function polishForVoice(text: string): string {
  let r = text;
  // Remove markdown bold/italic/code
  r = r.replace(/\*\*(.*?)\*\*/g, "$1");
  r = r.replace(/\*(.*?)\*/g, "$1");
  r = r.replace(/`(.*?)`/g, "$1");
  // Remove markdown headers
  r = r.replace(/^#+\s*/gm, "");
  // Remove bullet points and numbered lists
  r = r.replace(/^[\s]*[-•]\s*/gm, "");
  r = r.replace(/^[\s]*\d+\.\s*/gm, "");
  // Collapse newlines into spaces (spoken text doesn't have line breaks)
  r = r.replace(/\n{2,}/g, " ");
  r = r.replace(/\n/g, " ");
  // Clean up multiple spaces
  r = r.replace(/\s{2,}/g, " ");
  return r.trim();
}

export async function runOrchestrator(
  instruction: string,
  history?: { role: string; text: string }[]
): Promise<AgentResult> {
  devLog.info("orchestrator", `New instruction: "${instruction}"`);
  const lower = instruction.trim().toLowerCase();

  // 1. If there's a pending clarification question, route the input as the answer
  if (hasPendingQuestion()) {
    devLog.info("orchestrator", `Routing as clarification answer: "${instruction}"`);
    sendThought("Narrator", `Got it, passing that along!`, "thinking");
    answerQuestion(instruction.trim());
    return { success: true, message: "Got it, continuing with your answer." };
  }

  // 2. Stop/cancel commands — abort everything
  if (/\b(stop|cancel|wait|never\s*mind|halt|pause)\b/i.test(lower)) {
    devLog.info("orchestrator", `Stop command detected: "${instruction}"`);
    abortActiveTask(); // kills both orchestrator + navigator controllers
    sendThought("Narrator", "Alright, stopping!", "thinking");
    return { success: true, message: "Okay, stopped! What's next?" };
  }

  // 3. Go back command — navigate browser back
  if (/\b(go\s*back|back|undo|previous(\s*page)?)\b/i.test(lower)) {
    devLog.info("orchestrator", `Go back command detected`);
    sendThought("Narrator", "Going back!", "thinking");
    try {
      await goBack();
      await waitFor(1500);
      await takeScreenshot();
      const title = await getPageTitle() || "the previous page";
      sendThought("Narrator", `Alright, we're back on "${title}".`, "thinking");
      return { success: true, message: `Cool, went back to ${title}. What do you wanna do?` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Couldn't go back: ${msg}` };
    }
  }

  // Normal request — kill any running orchestrator + navigator, then clear abort
  abortActiveTask();
  clearAbort();

  // Immediate conversational feedback — varied so it doesn't feel robotic
  const initialMessages = [
    "On it!",
    "Got it, one sec.",
    "Sure thing.",
    "Let me look into that.",
    "Alright, checking it out.",
    "Working on it.",
  ];
  const initialMsg = initialMessages[Math.floor(Math.random() * initialMessages.length)];
  sendThought("Narrator", initialMsg, "thinking");

  // Create an AbortController for THIS orchestrator so it can be killed by future instructions
  const orchestratorController = new AbortController();
  registerOrchestratorController(orchestratorController);

  cleanupLearnedFlows();
  const userContext = getFullContext(sendThought);
  devLog.debug("orchestrator", "User context loaded", { context: userContext });

  // Build conversation history for context (skip the current message — it's already the instruction)
  let historyBlock = "";
  if (history && history.length > 1) {
    const prior = history.slice(0, -1); // exclude current message
    historyBlock = "\n\nConversation so far:\n" + prior.map(
      (m) => `${m.role === "user" ? "User" : "ReSight"}: ${m.text}`
    ).join("\n");
  }

  // Fetch current browser page context so the LLM knows where we are
  let pageContextBlock = "";
  try {
    const currentUrl = await getCurrentUrl();
    if (currentUrl && currentUrl !== "about:blank") {
      const currentTitle = await getPageTitle();
      pageContextBlock = `\nCurrent browser page: "${currentTitle || "Untitled"}" (${currentUrl})`;
      devLog.debug("orchestrator", `Page context: ${currentTitle} — ${currentUrl}`);
    }
  } catch {
    // No active page yet — that's fine
  }

  const prompt = `User preferences: ${JSON.stringify(userContext)}${historyBlock}${pageContextBlock}\n\nUser says: "${instruction}"`;
  const done = devLog.time("llm", "Orchestrator generateText call", {
    system: ORCHESTRATOR_SYSTEM.substring(0, 200) + "...",
    prompt,
  });

  try {
    const { text, steps } = await generateText({
      model: getModel(),
      system: ORCHESTRATOR_SYSTEM,
      prompt,
      stopWhen: stepCountIs(4),
      abortSignal: orchestratorController.signal,
      tools: {
        navigate: tool({
          description:
            "Navigate the web browser to complete the user's task. Pass the full user instruction — the navigator breaks it into steps internally.",
          inputSchema: z.object({
            instruction: z
              .string()
              .describe("The user's full browsing instruction"),
          }),
          execute: async ({ instruction: navInstruction }) => {
            devLog.info("orchestrator", `Tool call: navigate("${navInstruction}")`);
            const lastReSight = history
              ?.filter((m) => m.role !== "user")
              .pop()?.text;
            const result = await navigatorAgent(
              navInstruction,
              sendThought,
              lastReSight
            );
            devLog.info("orchestrator", `navigate returned`, {
              success: result.success,
              messagePreview: result.message?.substring(0, 200),
            });

            return result;
          },
        }),
        remember: tool({
          description:
            "Store or recall user preferences and personal information.",
          inputSchema: z.object({
            action: z.enum(["store", "recall"]).describe("Store or recall"),
            key: z.string().describe("The preference key"),
            value: z
              .string()
              .optional()
              .describe("Value to store (only for store action)"),
          }),
          execute: async ({ action, key, value }) => {
            devLog.info("orchestrator", `Tool call: remember(${action}, ${key})`);
            sendThought("Narrator", action === "store" ? `Got it, I'll remember that!` : `Let me think... what do I know about "${key}"...`, "thinking");
            return await scribeAgent(action, key, value, sendThought);
          },
        }),
        safety_check: tool({
          description:
            "Check if a URL, site, or action is safe. Use for: suspicious/shortened links (bit.ly etc.), unknown websites, deals that seem too good to be true, download prompts, pages asking for personal info, or anything that feels off. Do NOT use for routine purchases on known retailers the user asked for.",
          inputSchema: z.object({
            action: z.string().describe("The action or URL to check"),
            pageContext: z
              .string()
              .describe("Current page context/description, or the URL/link to evaluate"),
          }),
          execute: async ({ action, pageContext }) => {
            devLog.info("orchestrator", `Tool call: safety_check("${action}")`);
            const result = await guardianAgent(action, pageContext, sendThought, historyBlock || undefined);
            if (!result.success) {
              sendThought("Narrator", `Heads up — ${result.message}`, "thinking");
            }
            return result;
          },
        }),
      },
    });

    clearOrchestratorController();

    done({
      responseText: text?.substring(0, 300),
      stepCount: steps?.length ?? 0,
    });

    // Check if any tools were actually called (use steps — more reliable than toolResults in AI SDK v6)
    const hasToolExecution = steps && steps.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.toolCalls && s.toolCalls.length > 0
    );
    if (!hasToolExecution) {
      // Only skip navigator for pure conversational messages (greetings, thanks, etc.)
      const looksLikeBrowsing = /\b(find|search|open|go to|buy|check|get|look up|navigate|browse|compare|directions|restaurant|product|price|event|form|dmv|appointment|website|link|url|show|watch|play|video|youtube|read|tell me|what is|what are|how to|where|order|add to cart|recipe|news|weather|map|describe|page|screen|see|click|scroll|this)\b|https?:\/\//i.test(instruction);
      if (!looksLikeBrowsing && text?.trim()) {
        devLog.info("orchestrator", "No tools called, instruction not browsing — returning LLM response");
        return { success: true, message: polishForVoice(text), confirmationRequired: false };
      }
      devLog.warn("orchestrator", "No tools called by LLM, forcing navigator fallback");
      const lastReSight = history?.filter((m) => m.role !== "user").pop()?.text;
      const fallback = await navigatorAgent(instruction, sendThought, lastReSight);
      return { ...fallback, message: polishForVoice(fallback.message) };
    }

    // Check if any tool result requires confirmation
    const needsConfirmation = steps?.some(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.toolResults?.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => r.output && typeof r.output === "object" && r.output.confirmationRequired
      )
    );

    const finalMessage = polishForVoice(text || "All done!");
    devLog.info("orchestrator", "Orchestrator complete", {
      finalMessage: finalMessage.substring(0, 200),
      needsConfirmation,
    });
    return {
      success: true,
      message: finalMessage,
      confirmationRequired: needsConfirmation || false,
    };
  } catch (error) {
    clearOrchestratorController();

    // External abort (new instruction superseded this one) — stop silently
    const isAbortError = error instanceof Error &&
      (error.name === "AbortError" || error.message.includes("aborted"));
    if (isAbortError) {
      devLog.info("orchestrator", `Orchestrator externally aborted (new instruction took over)`);
      return { success: true, message: "Stopped." };
    }

    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    done({ error: errorMsg }, "error");
    devLog.error("orchestrator", `Orchestrator failed: ${errorMsg}`);
    sendThought("Narrator", `Hmm, something went wrong. Let me know if you want to try again.`, "thinking");
    return {
      success: false,
      message: `Ugh, hit a snag there. Want me to try that again?`,
    };
  }
}
