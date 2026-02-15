"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

export type GideonStatus = "idle" | "listening" | "thinking" | "speaking";

export interface ThoughtEntry {
  id: string;
  agent: string;
  message: string;
  timestamp: number;
  type?: "thinking" | "answer";
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface GideonContextValue {
  status: GideonStatus;
  setStatus: (s: GideonStatus) => void;
  thoughts: ThoughtEntry[];
  addThought: (agent: string, message: string, type?: "thinking" | "answer") => void;
  latestScreenshot: string | null;
  setLatestScreenshot: (s: string | null) => void;
  boundingBoxes: BoundingBox[];
  setBoundingBoxes: (b: BoundingBox[]) => void;
  activeAgent: string | null;
}

const GideonContext = createContext<GideonContextValue | null>(null);

export function useGideon() {
  const ctx = useContext(GideonContext);
  if (!ctx) throw new Error("useGideon must be used within GideonProvider");
  return ctx;
}

export function GideonProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<GideonStatus>("idle");
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const idCounter = useRef(0);

  const addThought = useCallback((agent: string, message: string, type?: "thinking" | "answer") => {
    setThoughts((prev) => [
      ...prev.slice(-99),
      { id: String(++idCounter.current), agent, message, timestamp: Date.now(), type },
    ]);

    if (!["Voice", "ReSight"].includes(agent)) {
      setActiveAgent(agent);
    }
  }, []);

  // Subscribe to the thought-stream SSE
  useEffect(() => {
    const eventSource = new EventSource("/api/thought-stream");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.agent && data.message) {
          console.log(`[${data.agent}] [${data.type || "thinking"}] ${data.message}`);
          addThought(data.agent, data.message, data.type);
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
            // First successful response: record whatever is cached as stale
            lastSeenTimestamp = ts;
            initialized = true;
            return;
          }

          // Only show screenshots that are newer than what was cached at mount
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
    <GideonContext.Provider
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
      }}
    >
      {children}
    </GideonContext.Provider>
  );
}
