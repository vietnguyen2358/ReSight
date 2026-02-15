"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReSight, type ChatMessage, type ThoughtSnapshot } from "@/components/providers/ReSightProvider";
import { MovingBorder } from "@/components/ui/moving-border";

interface PendingQuestion {
  question: string;
  options?: string[];
}

function parseAgent(agent: string): { from: string; to?: string } {
  const match = agent.match(/^(.+?)\s*→\s*(.+)$/);
  if (match) return { from: match[1].trim(), to: match[2].trim() };
  return { from: agent };
}

const INTERRUPT_PATTERN = /\b(stop|cancel|wait|never\s*mind|halt|pause|go\s*back|go back|back|undo|previous(\s*page)?)\b/i;

interface ChatPanelProps {
  inputMode?: "voice" | "chat";
  onInputModeChange?: (mode: "voice" | "chat") => void;
  speakButton?: React.ReactNode;
}

export default function ChatPanel({ inputMode = "chat", onInputModeChange, speakButton }: ChatPanelProps) {
  const { setStatus, thoughts, status, chatMessages, addChatMessage } = useReSight();
  const messages = chatMessages;
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestTimestamp = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const questionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thoughtsRef = useRef(thoughts);

  // Keep thoughtsRef in sync so we can read latest inside async callbacks
  useEffect(() => {
    thoughtsRef.current = thoughts;
  }, [thoughts]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape key interrupt
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && loading) {
        e.preventDefault();
        // Abort client-side fetch immediately
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
        // Cancel Web Speech
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        // Clear loading state
        setLoading(false);
        setStatus("idle");
        // Fire stop command to orchestrator (server-side cleanup)
        fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: "stop" }),
        }).catch(() => {});
        addChatMessage({ role: "user", text: "stop" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, setStatus]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thoughts, pendingQuestion]);

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

  // ── Web Speech for intermediary Narrator updates ──
  // Speaks short Narrator thoughts aloud so blind users hear progress (free, no API cost)
  const lastSpokenIdRef = useRef<string>("");
  useEffect(() => {
    if (!loading || typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const narratorThoughts = liveThoughts.filter((t) => {
      const { from } = parseAgent(t.agent);
      return from === "Narrator" && t.type === "thinking";
    });
    if (narratorThoughts.length === 0) return;

    const latest = narratorThoughts[narratorThoughts.length - 1];
    // Only speak new thoughts, and only short ones (long narrations are for reading, not speech)
    if (latest.id === lastSpokenIdRef.current) return;
    if (latest.message.length > 120) return;

    lastSpokenIdRef.current = latest.id;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(latest.message);
    utterance.rate = 1.1;
    utterance.volume = 0.7;
    window.speechSynthesis.speak(utterance);
  }, [liveThoughts, loading]);

  // Cancel Web Speech when loading ends (ElevenLabs takes over for final response)
  useEffect(() => {
    if (!loading && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, [loading]);

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

    const isInterrupt = INTERRUPT_PATTERN.test(text);

    // Pending question → route as answer (unchanged)
    if (loading && pendingQuestion) {
      addChatMessage({ role: "user", text });
      setInput("");
      submitAnswer(text);
      return;
    }

    if (loading) {
      // Abort the current client-side fetch
      if (abortRef.current) abortRef.current.abort();

      if (isInterrupt) {
        // Pure stop/cancel — send to backend and return
        fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: text }),
        }).catch(() => {});
        addChatMessage({ role: "user", text });
        setInput("");
        return;
      }
      // New instruction: fall through — the orchestrator will abort the
      // running orchestrator + navigator server-side via abortActiveTask()
    }

    addChatMessage({ role: "user", text });
    setInput("");

    setLoading(true);
    setStatus("thinking");
    requestTimestamp.current = Date.now();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const recentHistory = [...messages.map((m) => ({ role: m.role, text: m.text })), { role: "user" as const, text }]
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch("/api/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, history: recentHistory }),
        signal: controller.signal,
      });
      const result = await res.json();

      // Snapshot the thoughts that occurred during this request (use ref for latest)
      const capturedThoughts = thoughtsRef.current
        .filter((t) => t.timestamp >= requestTimestamp.current)
        .map((t) => ({ id: t.id, agent: t.agent, message: t.message, type: t.type }));

      addChatMessage({
        role: "assistant",
        text: result?.message || "Action completed.",
        thoughts: capturedThoughts,
      });
    } catch (err) {
      // Swallow abort errors — the new request takes over
      if (err instanceof DOMException && err.name === "AbortError") return;
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      addChatMessage({ role: "assistant", text: `Error: ${errMsg}` });
    } finally {
      // Only clear loading if this is still the active request
      if (abortRef.current === controller) {
        setLoading(false);
        setStatus("idle");
      }
    }
  }, [input, loading, setStatus, pendingQuestion, submitAnswer, messages, addChatMessage]);

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
          <div className="flex flex-col items-center justify-center h-full gap-5">
            {/* Animated orbital icon */}
            <div className="relative w-20 h-20" style={{ animation: "float 4s ease-in-out infinite" }}>
              {/* Outer ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  border: "1px solid rgba(0,229,255,0.12)",
                  animation: "orbit-spin 12s linear infinite",
                }}
              />
              {/* Inner ring */}
              <div
                className="absolute rounded-full"
                style={{
                  inset: "6px",
                  border: "1px solid rgba(212,255,0,0.08)",
                  animation: "orbit-spin 8s linear infinite reverse",
                }}
              />
              {/* Center dot */}
              <div
                className="absolute rounded-full"
                style={{
                  inset: "50%",
                  width: "6px",
                  height: "6px",
                  transform: "translate(-50%, -50%)",
                  background: "var(--color-resight-cyan)",
                  boxShadow: "0 0 12px rgba(0,229,255,0.4)",
                }}
              />
              {/* Orbiting particle */}
              <div
                className="absolute"
                style={{
                  width: "3px",
                  height: "3px",
                  borderRadius: "50%",
                  background: "var(--color-resight-yellow)",
                  top: "0",
                  left: "50%",
                  transform: "translateX(-50%)",
                  boxShadow: "0 0 6px var(--color-resight-yellow)",
                  animation: "orbit-spin 6s linear infinite",
                  transformOrigin: "0 40px",
                }}
              />
            </div>

            <div className="text-center">
              <p
                className="text-xs font-semibold uppercase tracking-[0.3em] mb-2"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--color-resight-cyan)",
                  textShadow: "0 0 15px rgba(0,229,255,0.2)",
                }}
              >
                ReSight Ready
              </p>
              <p
                className="text-[11px] leading-relaxed max-w-[260px] mb-5"
                style={{ color: "var(--color-resight-muted)" }}
              >
                Voice-controlled browser navigation. Try a command below.
              </p>
            </div>

            {/* Suggestion cards */}
            <div className="flex flex-col gap-2 w-full max-w-[300px]">
              {[
                "Find protein powder on Target",
                "Show me latest videos on Youtube",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="text-left px-4 py-3 rounded-lg text-[11px] leading-relaxed cursor-pointer transition-all duration-300 group"
                  style={{
                    background: "rgba(255,255,255,0.015)",
                    border: "1px solid rgba(255,255,255,0.04)",
                    color: "var(--color-resight-muted)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(0,229,255,0.04)";
                    e.currentTarget.style.borderColor = "rgba(0,229,255,0.15)";
                    e.currentTarget.style.color = "rgba(255,255,255,0.7)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.015)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.color = "var(--color-resight-muted)";
                  }}
                >
                  <span style={{ color: "var(--color-resight-cyan)", opacity: 0.5, marginRight: "8px" }}>
                    &rarr;
                  </span>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <AnimatePresence mode="popLayout">
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`mb-4 ${msg.role === "user" ? "flex justify-end" : ""}`}
            >
              {msg.role === "user" ? (
                <div
                  className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-sm text-xs leading-relaxed"
                  style={{
                    background: "rgba(212,255,0,0.06)",
                    border: "1px solid rgba(212,255,0,0.12)",
                    color: "var(--color-resight-yellow)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {msg.text}
                </div>
              ) : (
                <div className="max-w-[90%]">
                  {/* Final response */}
                  <div className="flex gap-3">
                    <div
                      className="w-[2px] flex-none rounded-full mt-1"
                      style={{
                        background: "linear-gradient(180deg, var(--color-resight-green), transparent)",
                        opacity: 0.4,
                      }}
                    />
                    <div className="min-w-0">
                      <span
                        className="text-[9px] uppercase tracking-[0.2em] font-bold"
                        style={{
                          fontFamily: "var(--font-display)",
                          color: "var(--color-resight-green)",
                          opacity: 0.5,
                        }}
                      >
                        ReSight
                      </span>
                      <p
                        className="text-[13px] leading-relaxed mt-1"
                        style={{ color: "rgba(255,255,255,0.85)" }}
                      >
                        {msg.text}
                      </p>

                      {/* Collapsible thought trail */}
                      {msg.thoughts && msg.thoughts.length > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() =>
                              setExpandedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(msg.id)) next.delete(msg.id);
                                else next.add(msg.id);
                                return next;
                              })
                            }
                            className="flex items-center gap-1.5 text-[10px] cursor-pointer transition-all duration-200"
                            style={{
                              color: "var(--color-resight-muted)",
                              opacity: 0.6,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; }}
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              style={{
                                transform: expandedIds.has(msg.id) ? "rotate(90deg)" : "rotate(0deg)",
                                transition: "transform 0.2s ease",
                              }}
                            >
                              <path d="M9 18l6-6-6-6" />
                            </svg>
                            {expandedIds.has(msg.id) ? "Hide" : "Show"} reasoning ({msg.thoughts.length} steps)
                          </button>

                          {expandedIds.has(msg.id) && (
                            <div
                              className="mt-2 space-y-0.5 pl-2"
                              style={{
                                borderLeft: "1px solid rgba(255,255,255,0.06)",
                              }}
                            >
                              {msg.thoughts.map((t) => {
                                const { from, to } = parseAgent(t.agent);
                                const isInterAgent = !!to;
                                const isNarrator = from === "Narrator";

                                if (isNarrator) {
                                  const isAnswer = t.type === "answer";
                                  return (
                                    <div key={`t-${t.id}`} className="flex gap-2 py-0.5 pl-2">
                                      <div className="min-w-0">
                                        <span className="flex items-center gap-1.5">
                                          <span
                                            className="text-[9px] uppercase tracking-[0.15em] font-bold"
                                            style={{
                                              fontFamily: "var(--font-display)",
                                              color: isAnswer ? "var(--color-resight-yellow)" : "var(--color-resight-green)",
                                              opacity: isAnswer ? 0.7 : 0.4,
                                            }}
                                          >
                                            Narrator
                                          </span>
                                          <span
                                            className="text-[7px] uppercase tracking-[0.1em] px-1 py-px rounded"
                                            style={{
                                              fontFamily: "var(--font-display)",
                                              color: isAnswer ? "var(--color-resight-yellow)" : "var(--color-resight-muted)",
                                              background: isAnswer ? "rgba(212,255,0,0.08)" : "rgba(255,255,255,0.03)",
                                              opacity: isAnswer ? 0.8 : 0.4,
                                            }}
                                          >
                                            {isAnswer ? "answer" : "thinking"}
                                          </span>
                                        </span>
                                        <p
                                          className="text-[11px] leading-relaxed mt-0.5"
                                          style={{ color: isAnswer ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.45)" }}
                                        >
                                          {t.message}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={`t-${t.id}`} className="flex items-start gap-2 py-0.5 pl-2">
                                    <div
                                      className="w-1 h-1 rounded-full mt-1.5 flex-none"
                                      style={{
                                        background: isInterAgent
                                          ? "var(--color-resight-gold)"
                                          : "var(--color-resight-cyan)",
                                        opacity: 0.3,
                                      }}
                                    />
                                    <div className="min-w-0">
                                      {isInterAgent ? (
                                        <span
                                          className="text-[10px] leading-snug"
                                          style={{ color: "rgba(255,190,11,0.25)" }}
                                        >
                                          <span className="font-bold">{from}</span>
                                          <span style={{ opacity: 0.4 }}>{" → "}</span>
                                          <span className="font-bold">{to}</span>
                                          <span style={{ opacity: 0.4 }}> {t.message}</span>
                                        </span>
                                      ) : (
                                        <span className="text-[10px] leading-snug">
                                          <span
                                            className="font-bold"
                                            style={{ color: "var(--color-resight-cyan)", opacity: 0.35 }}
                                          >
                                            [{from}]
                                          </span>{" "}
                                          <span style={{ color: "var(--color-resight-muted)", opacity: 0.5 }}>
                                            {t.message}
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Live agent thoughts during loading */}
        {loading && (
          <div className="mb-3 space-y-0.5">
            <AnimatePresence mode="popLayout">
              {liveThoughts.map((t) => {
                const { from, to } = parseAgent(t.agent);
                const isInterAgent = !!to;
                const isNarrator = from === "Narrator";

                if (isNarrator) {
                  const isAnswer = t.type === "answer";
                  return (
                    <motion.div
                      key={`live-${t.id}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="flex gap-3 py-2"
                    >
                      <div
                        className="w-[2px] flex-none rounded-full mt-0.5"
                        style={{
                          background: isAnswer
                            ? "linear-gradient(180deg, var(--color-resight-yellow), transparent)"
                            : "linear-gradient(180deg, var(--color-resight-green), transparent)",
                          opacity: isAnswer ? 0.9 : 0.6,
                        }}
                      />
                      <div className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span
                            className="text-[9px] uppercase tracking-[0.2em] font-bold"
                            style={{
                              fontFamily: "var(--font-display)",
                              color: isAnswer ? "var(--color-resight-yellow)" : "var(--color-resight-green)",
                              opacity: isAnswer ? 0.9 : 0.6,
                            }}
                          >
                            Narrator
                          </span>
                          <span
                            className="text-[8px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded"
                            style={{
                              fontFamily: "var(--font-display)",
                              color: isAnswer ? "var(--color-resight-yellow)" : "var(--color-resight-muted)",
                              background: isAnswer ? "rgba(212,255,0,0.1)" : "rgba(255,255,255,0.04)",
                              border: `1px solid ${isAnswer ? "rgba(212,255,0,0.2)" : "rgba(255,255,255,0.06)"}`,
                              opacity: isAnswer ? 1 : 0.5,
                            }}
                          >
                            {isAnswer ? "answer" : "thinking"}
                          </span>
                        </span>
                        <p
                          className="text-sm leading-relaxed mt-0.5"
                          style={{ color: isAnswer ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.85)" }}
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
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-start gap-2.5 py-0.5"
                  >
                    <div
                      className="w-1 h-1 rounded-full mt-1.5 flex-none"
                      style={{
                        background: isInterAgent
                          ? "var(--color-resight-gold)"
                          : "var(--color-resight-cyan)",
                        boxShadow: `0 0 4px ${isInterAgent ? "var(--color-resight-gold)" : "var(--color-resight-cyan)"}`,
                      }}
                    />
                    <div className="min-w-0">
                      {isInterAgent ? (
                        <span
                          className="text-[10px] leading-snug"
                          style={{ color: "rgba(255,190,11,0.45)" }}
                        >
                          <span className="font-bold">{from}</span>
                          <span style={{ opacity: 0.4 }}>{" → "}</span>
                          <span className="font-bold">{to}</span>
                          <span style={{ opacity: 0.55 }}> {t.message}</span>
                        </span>
                      ) : (
                        <span className="text-[10px] leading-snug">
                          <span
                            className="font-bold"
                            style={{ color: "var(--color-resight-cyan)", opacity: 0.6 }}
                          >
                            [{from}]
                          </span>{" "}
                          <span style={{ color: "var(--color-resight-muted)" }}>
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
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="rounded-xl p-4 mt-3"
                style={{
                  background: "rgba(0,229,255,0.04)",
                  border: "1px solid rgba(0,229,255,0.15)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <p
                  className="text-sm leading-relaxed mb-3"
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
                        className="px-3.5 py-2 rounded-lg text-xs cursor-pointer transition-all duration-200"
                        style={{
                          background: "rgba(0,229,255,0.06)",
                          border: "1px solid rgba(0,229,255,0.2)",
                          color: "var(--color-resight-cyan)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(0,229,255,0.12)";
                          e.currentTarget.style.borderColor = "rgba(0,229,255,0.35)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(0,229,255,0.06)";
                          e.currentTarget.style.borderColor = "rgba(0,229,255,0.2)";
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* Connecting state */}
            {liveThoughts.length === 0 && !pendingQuestion && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2.5 py-2"
              >
                <div className="flex gap-1 items-end h-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-[2px] rounded-full"
                      style={{
                        height: "100%",
                        background: "var(--color-resight-gold)",
                        animation: `waveform-${(i % 3) + 1} ${0.6 + i * 0.1}s ease-in-out ${i * 0.08}s infinite`,
                        opacity: 0.6,
                      }}
                    />
                  ))}
                </div>
                <span
                  className="text-[10px] uppercase tracking-[0.15em]"
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--color-resight-gold)",
                    opacity: 0.5,
                  }}
                >
                  Connecting to agents
                </span>
              </motion.div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input Dock: segmented toggle + active input ── */}
      <div className="flex-none relative px-4 pb-4 pt-2">
        {/* Top separator */}
        <div
          className="absolute top-0 left-0 right-0 h-[1px]"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.1) 50%, transparent 100%)",
          }}
        />

        {/* Segmented Voice / Chat toggle */}
        {onInputModeChange && (
          <div className="flex justify-center mb-3">
            <div
              className="inline-flex items-center rounded-full p-[3px]"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {(["voice", "chat"] as const).map((mode) => {
                const active = inputMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => onInputModeChange(mode)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] uppercase tracking-[0.15em] cursor-pointer transition-all duration-300"
                    style={{
                      fontFamily: "var(--font-display)",
                      background: active ? "rgba(0,229,255,0.08)" : "transparent",
                      color: active ? "var(--color-resight-cyan)" : "var(--color-resight-muted)",
                      border: active ? "1px solid rgba(0,229,255,0.15)" : "1px solid transparent",
                    }}
                  >
                    {mode === "voice" ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" x2="12" y1="19" y2="22" />
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 16h8" />
                      </svg>
                    )}
                    {mode}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Active input method */}
        {inputMode === "voice" && speakButton ? (
          <div className="flex justify-center">
            {speakButton}
          </div>
        ) : inputMode === "chat" ? (
          <MovingBorder
            duration={loading ? 2000 : 4000}
            borderRadius="1rem"
            colors={
              loading
                ? ["#ffbe0b", "#d4ff00", "#ffbe0b", "#d4ff00"]
                : input.trim()
                  ? ["#d4ff00", "#00e5ff", "#d4ff00", "#00e5ff"]
                  : ["#505068", "#505068", "#505068", "#505068"]
            }
            containerClassName="w-full"
            className="w-full"
            style={{
              background: "rgba(8,8,12,0.9)",
              backdropFilter: "blur(12px)",
            }}
          >
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
                pendingQuestion
                  ? "Type your answer..."
                  : loading
                    ? "Send new instruction or 'stop' to cancel..."
                    : "Message ReSight..."
              }
              rows={2}
              className="w-full bg-transparent text-sm leading-relaxed px-4 pt-3.5 pb-2
                         outline-none resize-none placeholder:text-white/15"
              style={{
                color: "rgba(255,255,255,0.9)",
                caretColor: "var(--color-resight-cyan)",
                wordWrap: "break-word",
                overflowWrap: "break-word",
                maxHeight: "120px",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = Math.min(target.scrollHeight, 120) + "px";
              }}
            />
            <div className="flex items-center justify-between px-4 pb-3">
              <span
                className="text-[10px] tracking-wide"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--color-resight-muted)",
                  opacity: 0.5,
                }}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{
                        background: "var(--color-resight-gold)",
                        animation: "dot-breathe 1.5s ease-in-out infinite",
                      }}
                    />
                    Processing
                  </span>
                ) : (
                  "Enter to send"
                )}
              </span>
              <button
                onClick={send}
                disabled={!input.trim()}
                className="flex items-center justify-center w-8 h-8 rounded-xl
                           cursor-pointer disabled:cursor-not-allowed transition-all duration-200"
                style={{
                  background: input.trim() ? "rgba(212,255,0,0.1)" : "transparent",
                  color: input.trim() ? "var(--color-resight-yellow)" : "var(--color-resight-muted)",
                  opacity: input.trim() ? 1 : 0.25,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </MovingBorder>
        ) : null}
      </div>
    </div>
  );
}
