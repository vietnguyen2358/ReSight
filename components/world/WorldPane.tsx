"use client";

import LiveFeed from "./LiveFeed";
import { useGideon } from "@/components/providers/GideonProvider";

export default function WorldPane() {
  const { activeAgent, status } = useGideon();
  const isActive = status === "thinking" || status === "listening";

  return (
    <div className="flex flex-col h-full bg-resight-dark relative">
      {/* Header */}
      <div className="flex-none relative">
        <div className="px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Signal indicator */}
            <div className="flex items-center gap-0.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-sm transition-all duration-500"
                  style={{
                    height: `${8 + i * 4}px`,
                    background: isActive
                      ? "var(--color-resight-green)"
                      : i === 0
                        ? "var(--color-resight-green)"
                        : "rgba(255,255,255,0.08)",
                    opacity: isActive ? 0.8 : i === 0 ? 0.5 : 0.3,
                    boxShadow: isActive ? `0 0 4px var(--color-resight-green)` : "none",
                  }}
                />
              ))}
            </div>
            <span
              className="text-xs uppercase tracking-[0.2em]"
              style={{
                fontFamily: "var(--font-display)",
                color: isActive ? "var(--color-resight-green)" : "var(--color-resight-muted)",
                transition: "color 0.3s ease",
              }}
            >
              Live Feed
            </span>
          </div>

          {activeAgent && activeAgent !== "None" && (
            <div className="flex items-center gap-2">
              <div
                className="w-1 h-1 rounded-full"
                style={{
                  background: "var(--color-resight-cyan)",
                  animation: "dot-breathe 1.5s ease-in-out infinite",
                  boxShadow: "0 0 4px var(--color-resight-cyan)",
                }}
              />
              <span
                className="text-[10px] uppercase tracking-[0.15em]"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--color-resight-cyan)",
                  opacity: 0.7,
                }}
              >
                {activeAgent}
              </span>
            </div>
          )}
        </div>

        <div
          className="h-[1px] w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent 100%)",
          }}
        />
      </div>

      {/* Feed */}
      <div className="flex-1 relative overflow-hidden vignette grid place-items-center">
        <LiveFeed />
        <div className="scanlines" />
      </div>

      {/* Status bar */}
      <div className="flex-none relative">
        <div
          className="h-[1px] w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
          }}
        />
        <div className="px-5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-1 h-1 rounded-full"
              style={{
                background: isActive ? "var(--color-resight-green)" : "var(--color-resight-muted)",
                animation: isActive ? "dot-breathe 2s ease-in-out infinite" : "none",
              }}
            />
            <span
              className="text-[10px] tracking-wide"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--color-resight-muted)",
                opacity: 0.6,
              }}
            >
              {isActive ? "Streaming" : "Standby"}
            </span>
          </div>
          <span
            className="text-[10px] tracking-wide"
            style={{
              fontFamily: "var(--font-display)",
              color: "var(--color-resight-muted)",
              opacity: 0.4,
            }}
          >
            Stagehand Session
          </span>
        </div>
      </div>
    </div>
  );
}
