"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGideon } from "@/components/providers/GideonProvider";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface PendingQuestion {
  question: string;
  options?: string[];
}

/** Detect inter-agent messages like "Navigator → Orchestrator" */
function parseAgent(agent: string): { from: string; to?: string } {
  const match = agent.match(/^(.+?)\s*→\s*(.+)$/);
  if (match) return { from: match[1].trim(), to: match[2].trim() };
  return { from: agent };
}

const INTERRUPT_PATTERN = /^(stop|cancel|wait|never\s*mind|halt|pause|go\s*back|back|undo|previous(\s*page)?)$/i;

export default function ChatPanel() {
  const { setStatus, thoughts, status } = useGideon();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const idRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestTimestamp = useRef(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const questionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thoughts, pendingQuestion]);

  // Poll for clarification questions during loading
  useEffect(() => {
    if (loading) {
      questionPollRef.current = setInterval(async () => {
        try {
          const res = await fetch("/api/clarification");
          const data = await res.json();
          if (data.question) {
            setPendingQuestion({ question: data.question, options: data.options });
          } else {
            setPendingQuestion(null);
          }
        } catch {
          // ignore poll errors
        }
      }, 500);
    } else {
      setPendingQuestion(null);
      if (questionPollRef.current) {
        clearInterval(questionPollRef.current);
        questionPollRef.current = null;
      }
    }
    return () => {
      if (questionPollRef.current) {
        clearInterval(questionPollRef.current);
        questionPollRef.current = null;
      }
    };
  }, [loading]);

  const liveThoughts = loading
    ? thoughts.filter((t) => t.timestamp >= requestTimestamp.current)
    : [];

  const submitAnswer = useCallback(async (answer: string) => {
    setPendingQuestion(null);
    try {
      await fetch("/api/clarification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
    } catch {
      // ignore
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;

    // Allow interrupt commands even during loading
    const isInterrupt = INTERRUPT_PATTERN.test(text);
    if (loading && !isInterrupt) return;

    const userMsg: ChatMessage = {
      id: `user-${++idRef.current}`,
      role: "user",
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // If it's an interrupt during loading, send it but don't set loading state again
    if (loading && isInterrupt) {
      try {
        const res = await fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: text }),
        });
        const result = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: `reply-${++idRef.current}`,
            role: "assistant",
            text: result?.message || "Done.",
            timestamp: Date.now(),
          },
        ]);
      } catch {
        // ignore interrupt errors
      }
      return;
    }

    setLoading(true);
    setStatus("thinking");
    requestTimestamp.current = Date.now();

    try {
      const res = await fetch("/api/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text }),
      });
      const result = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          id: `reply-${++idRef.current}`,
          role: "assistant",
          text: result?.message || "Action completed.",
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${++idRef.current}`,
          role: "assistant",
          text: `Error: ${errMsg}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
      setStatus("idle");
    }
  }, [input, loading, setStatus]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Feed ── */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-5 py-4"
        style={{ scrollbarGutter: "stable" }}
      >
        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 opacity-60">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: "rgba(0,255,255,0.05)",
                border: "1px solid rgba(0,255,255,0.1)",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-gideon-cyan"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <path d="M8 12l2 2 4-4" />
              </svg>
            </div>
            <div className="text-center">
              <p
                className="text-xs uppercase tracking-[0.2em] mb-2"
                style={{ color: "var(--color-gideon-cyan)" }}
              >
                Gideon Ready
              </p>
              <p
                className="text-[11px] leading-relaxed max-w-[280px]"
                style={{ color: "var(--color-gideon-muted)" }}
              >
                Try: &quot;Find protein powder on Target&quot; or &quot;Show me the latest videos from jasontheween&quot;
              </p>
            </div>
          </div>
        )}

        {/* Messages */}
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={`mb-3 ${msg.role === "user" ? "flex justify-end" : ""}`}
            >
              {msg.role === "user" ? (
                /* User message — right-aligned bubble */
                <div
                  className="max-w-[85%] px-3.5 py-2.5 rounded-lg text-xs leading-relaxed"
                  style={{
                    background: "rgba(204,255,0,0.08)",
                    border: "1px solid rgba(204,255,0,0.15)",
                    color: "var(--color-gideon-yellow)",
                  }}
                >
                  {msg.text}
                </div>
              ) : (
                /* Assistant response — left-aligned with accent bar */
                <div className="max-w-[92%] flex gap-2.5">
                  <div
                    className="w-[2px] flex-none rounded-full mt-1"
                    style={{ background: "var(--color-gideon-green)", opacity: 0.5 }}
                  />
                  <div>
                    <span
                      className="text-[9px] uppercase tracking-[0.15em] font-bold"
                      style={{ color: "var(--color-gideon-green)", opacity: 0.6 }}
                    >
                      Gideon
                    </span>
                    <p
                      className="text-xs leading-relaxed mt-0.5"
                      style={{ color: "rgba(255,255,255,0.85)" }}
                    >
                      {msg.text}
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Live agent thoughts during loading */}
        {loading && (
          <div className="mb-3 space-y-1">
            <AnimatePresence mode="popLayout">
              {liveThoughts.map((t) => {
                const { from, to } = parseAgent(t.agent);
                const isInterAgent = !!to;
                const isNarrator = from === "Narrator";

                if (isNarrator) {
                  // Narrator messages — prominent, white text with green bar
                  return (
                    <motion.div
                      key={`live-${t.id}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex gap-2.5 py-1.5"
                    >
                      <div
                        className="w-[2px] flex-none rounded-full mt-0.5"
                        style={{ background: "var(--color-gideon-green)", opacity: 0.7 }}
                      />
                      <div className="min-w-0">
                        <span
                          className="text-[9px] uppercase tracking-[0.15em] font-bold"
                          style={{ color: "var(--color-gideon-green)", opacity: 0.7 }}
                        >
                          Narrator
                        </span>
                        <p
                          className="text-sm leading-relaxed mt-0.5"
                          style={{ color: "rgba(255,255,255,0.85)" }}
                        >
                          {t.message}
                        </p>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={`live-${t.id}`}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-start gap-2 py-0.5"
                  >
                    {/* Agent indicator dot */}
                    <div
                      className="w-1 h-1 rounded-full mt-1.5 flex-none"
                      style={{
                        background: isInterAgent
                          ? "var(--color-gideon-gold)"
                          : "var(--color-gideon-cyan)",
                      }}
                    />
                    <div className="min-w-0">
                      {isInterAgent ? (
                        /* Inter-agent communication */
                        <span
                          className="text-[10px] leading-snug"
                          style={{ color: "rgba(255,215,0,0.5)" }}
                        >
                          <span className="font-bold">{from}</span>
                          <span style={{ opacity: 0.4 }}>{" → "}</span>
                          <span className="font-bold">{to}</span>
                          <span style={{ opacity: 0.6 }}>
                            {" "}
                            {t.message}
                          </span>
                        </span>
                      ) : (
                        /* Regular agent thought */
                        <span className="text-[10px] leading-snug">
                          <span
                            className="font-bold"
                            style={{ color: "var(--color-gideon-cyan)", opacity: 0.7 }}
                          >
                            [{from}]
                          </span>{" "}
                          <span style={{ color: "var(--color-gideon-muted)" }}>
                            {t.message}
                          </span>
                        </span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Pending question card */}
            {pendingQuestion && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-lg p-3 mt-2"
                style={{
                  background: "rgba(0,255,255,0.05)",
                  border: "1px solid rgba(0,255,255,0.25)",
                }}
              >
                <p
                  className="text-sm leading-relaxed mb-2"
                  style={{ color: "rgba(255,255,255,0.9)" }}
                >
                  {pendingQuestion.question}
                </p>
                {pendingQuestion.options && pendingQuestion.options.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingQuestion.options.map((opt, i) => (
                      <button
                        key={i}
                        onClick={() => submitAnswer(opt)}
                        className="px-3 py-1.5 rounded-md text-xs cursor-pointer transition-all duration-150 hover:brightness-125"
                        style={{
                          background: "rgba(0,255,255,0.1)",
                          border: "1px solid rgba(0,255,255,0.3)",
                          color: "var(--color-gideon-cyan)",
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {liveThoughts.length === 0 && !pendingQuestion && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 py-1"
              >
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1 h-1 rounded-full bg-gideon-gold"
                      style={{
                        animation: `pulse 1s ease-in-out ${i * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
                <span
                  className="text-[10px] uppercase tracking-widest"
                  style={{ color: "var(--color-gideon-gold)", opacity: 0.6 }}
                >
                  Connecting to agents
                </span>
              </motion.div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input Area ── */}
      <div className="flex-none relative px-4 pb-4 pt-2">
        {/* Top separator */}
        <div
          className="absolute top-0 left-0 right-0 h-[1px]"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(0,255,255,0.15) 50%, transparent 100%)",
          }}
        />

        {/* Input container */}
        <div
          className="relative rounded-xl overflow-hidden transition-all duration-300"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${
              loading
                ? "rgba(255,215,0,0.3)"
                : input.trim()
                  ? "rgba(204,255,0,0.25)"
                  : "rgba(255,255,255,0.08)"
            }`,
            boxShadow: loading
              ? "0 0 20px rgba(255,215,0,0.08), inset 0 1px 0 rgba(255,255,255,0.03)"
              : input.trim()
                ? "0 0 15px rgba(204,255,0,0.05), inset 0 1px 0 rgba(255,255,255,0.03)"
                : "inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              loading ? "Type 'stop' to cancel or 'go back'..." : "Message Gideon..."
            }
            rows={2}
            className="w-full bg-transparent text-sm leading-relaxed px-4 pt-3 pb-2
                       outline-none resize-none
                       placeholder:text-white/20"
            style={{
              color: "rgba(255,255,255,0.9)",
              caretColor: "var(--color-gideon-cyan)",
              wordWrap: "break-word",
              overflowWrap: "break-word",
              maxHeight: "120px",
              opacity: loading ? 0.6 : 1,
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />

          {/* Bottom bar: hint + send button */}
          <div className="flex items-center justify-between px-4 pb-2.5">
            <span
              className="text-[10px] tracking-wide"
              style={{ color: "var(--color-gideon-muted)", opacity: 0.6 }}
            >
              {loading ? (
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{
                      background: "var(--color-gideon-gold)",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                  Processing — type &quot;stop&quot; to cancel
                </span>
              ) : (
                "Enter to send"
              )}
            </span>

            <button
              onClick={send}
              disabled={!input.trim() || (loading && !INTERRUPT_PATTERN.test(input.trim()))}
              className="flex items-center justify-center w-8 h-8 rounded-lg
                         cursor-pointer disabled:cursor-not-allowed
                         transition-all duration-200"
              style={{
                background:
                  input.trim()
                    ? "rgba(204,255,0,0.15)"
                    : "rgba(255,255,255,0.03)",
                color:
                  input.trim()
                    ? "var(--color-gideon-yellow)"
                    : "var(--color-gideon-muted)",
                opacity: input.trim() ? 1 : 0.3,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
