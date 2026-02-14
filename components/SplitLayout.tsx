"use client";

import { useState } from "react";
import MindPane from "@/components/mind/MindPane";
import WorldPane from "@/components/world/WorldPane";

type PaneView = "split" | "mind" | "world";

export default function SplitLayout() {
  const [view, setView] = useState<PaneView>("split");

  return (
    <div className="flex h-screen w-screen bg-gideon-black relative">
      {/* Mind Pane — always mounted to preserve chat state */}
      <div
        className="h-full overflow-hidden transition-all duration-500 ease-in-out"
        style={{
          width:
            view === "split" ? "50%" : view === "mind" ? "100%" : "0%",
          opacity: view === "world" ? 0 : 1,
          pointerEvents: view === "world" ? "none" : "auto",
        }}
      >
        <MindPane />
      </div>

      {/* Glow Divider — only in split view */}
      {view === "split" && <div className="glow-divider flex-none" />}

      {/* World Pane — always mounted to preserve state */}
      <div
        className="h-full overflow-hidden transition-all duration-500 ease-in-out"
        style={{
          width:
            view === "split" ? "50%" : view === "world" ? "100%" : "0%",
          opacity: view === "mind" ? 0 : 1,
          pointerEvents: view === "mind" ? "none" : "auto",
        }}
      >
        <WorldPane />
      </div>

      {/* ── Toggle Controls ── */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-full px-1.5 py-1.5"
        style={{
          background: "rgba(8,8,12,0.85)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Mind toggle */}
        <button
          onClick={() => setView(view === "mind" ? "split" : "mind")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.15em] cursor-pointer transition-all duration-300"
          style={{
            fontFamily: "var(--font-display)",
            background:
              view === "mind"
                ? "rgba(0,229,255,0.1)"
                : "transparent",
            color:
              view === "mind"
                ? "var(--color-gideon-cyan)"
                : "var(--color-gideon-muted)",
            border: `1px solid ${
              view === "mind"
                ? "rgba(0,229,255,0.2)"
                : "transparent"
            }`,
          }}
          title="Toggle Mind pane"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          Mind
        </button>

        {/* Split toggle */}
        <button
          onClick={() => setView("split")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.15em] cursor-pointer transition-all duration-300"
          style={{
            fontFamily: "var(--font-display)",
            background:
              view === "split"
                ? "rgba(212,255,0,0.08)"
                : "transparent",
            color:
              view === "split"
                ? "var(--color-gideon-yellow)"
                : "var(--color-gideon-muted)",
            border: `1px solid ${
              view === "split"
                ? "rgba(212,255,0,0.15)"
                : "transparent"
            }`,
          }}
          title="Split view"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
          Split
        </button>

        {/* World toggle */}
        <button
          onClick={() => setView(view === "world" ? "split" : "world")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.15em] cursor-pointer transition-all duration-300"
          style={{
            fontFamily: "var(--font-display)",
            background:
              view === "world"
                ? "rgba(0,255,106,0.08)"
                : "transparent",
            color:
              view === "world"
                ? "var(--color-gideon-green)"
                : "var(--color-gideon-muted)",
            border: `1px solid ${
              view === "world"
                ? "rgba(0,255,106,0.15)"
                : "transparent"
            }`,
          }}
          title="Toggle World pane"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          World
        </button>
      </div>
    </div>
  );
}
