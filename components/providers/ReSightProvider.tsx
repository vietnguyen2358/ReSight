"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

export type ReSightStatus = "idle" | "listening" | "thinking" | "speaking";

export interface ThoughtEntry {
  id: string;
  agent: string;
  message: string;
  timestamp: number;
  type?: "thinking" | "answer";
  activity?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface ThoughtSnapshot {
  id: string;
  agent: string;
  message: string;
  type?: "thinking" | "answer";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  thoughts?: ThoughtSnapshot[];
}

interface ReSightContextValue {
  status: ReSightStatus;
  setStatus: (s: ReSightStatus) => void;
  thoughts: ThoughtEntry[];
  addThought: (
    agent: string,
    message: string,
    type?: "thinking" | "answer",
    activity?: string
  ) => void;
  latestScreenshot: string | null;
  setLatestScreenshot: (s: string | null) => void;
  boundingBoxes: BoundingBox[];
  setBoundingBoxes: (b: BoundingBox[]) => void;
  activeAgent: string | null;
  chatMessages: ChatMessage[];
  addChatMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
}

const ReSightContext = createContext<ReSightContextValue | null>(null);

export function useReSight() {
  const ctx = useContext(ReSightContext);
  if (!ctx) throw new Error("useReSight must be used within ReSightProvider");
  return ctx;
}

export function ReSightProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatusState] = useState<ReSightStatus>("idle");
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const idCounter = useRef(0);
  const chatIdCounter = useRef(0);

  const setStatus = useCallback((s: ReSightStatus) => {
    setStatusState(s);
    if (s === "idle") setActiveAgent(null);
  }, []);

  const addThought = useCallback(
    (
      agent: string,
      message: string,
      type?: "thinking" | "answer",
      activity?: string
    ) => {
      setThoughts((prev) => [
        ...prev.slice(-99),
        {
          id: String(++idCounter.current),
          agent,
          message,
          timestamp: Date.now(),
          type,
          activity,
        },
      ]);
      if (!["Voice", "ReSight"].includes(agent)) {
        setActiveAgent(agent);
      }
    },
    []
  );

  const addChatMessage = useCallback(
    (msg: Omit<ChatMessage, "id" | "timestamp">) => {
      const full: ChatMessage = {
        ...msg,
        id: `chat-${++chatIdCounter.current}`,
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev.slice(-99), full]);
    },
    []
  );

  // Subscribe to the thought-stream SSE
  useEffect(() => {
    const eventSource = new EventSource("/api/thought-stream");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.agent && data.message) {
          console.log(`[${data.agent}] [${data.type || "thinking"}] ${data.message}`);
          addThought(data.agent, data.message, data.type, data.activity);
        }
      } catch {
        // ignore parse errors
      }
    };

    eventSource.onerror = () => {
      console.warn("[ThoughtStream] SSE connection error, will auto-reconnect");
    };

    return () => eventSource.close();
  }, [addThought]);

  // Poll screenshots — ignore stale screenshots from before this session
  useEffect(() => {
    let lastSeenTimestamp = 0;
    let initialized = false;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/screenshot?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const ts = data.timestamp ?? 0;

          if (!initialized) {
            lastSeenTimestamp = ts;
            initialized = true;
            return;
          }

          if (data.screenshot && ts > lastSeenTimestamp) {
            setLatestScreenshot(data.screenshot);
            setBoundingBoxes(data.boundingBoxes ?? []);
            lastSeenTimestamp = ts;
          }
        }
      } catch {
        // ignore fetch errors
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <ReSightContext.Provider
      value={{
        status,
        setStatus,
        thoughts,
        addThought,
        latestScreenshot,
        setLatestScreenshot,
        boundingBoxes,
        setBoundingBoxes,
        activeAgent,
        chatMessages,
        addChatMessage,
      }}
    >
      {children}
    </ReSightContext.Provider>
  );
}
