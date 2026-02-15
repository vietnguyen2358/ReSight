"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface DevLogEntry {
  id: number;
  timestamp: number;
  category: string;
  level: string;
  title: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  stagehand: "#a78bfa",
  llm: "#00e5ff",
  navigation: "#00ff6a",
  orchestrator: "#ffbe0b",
  navigator: "#d4ff00",
  error: "#f87171",
};

const LEVEL_ICONS: Record<string, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERR!",
  debug: "DBG ",
};

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

export default function DevPage() {
  const [logs, setLogs] = useState<DevLogEntry[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);

  // Poll for new logs every second
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/dev-logs?since=${lastIdRef.current}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const newLogs: DevLogEntry[] = await res.json();
      if (newLogs.length > 0) {
        lastIdRef.current = newLogs[newLogs.length - 1].id;
        setLogs((prev) => [...prev, ...newLogs].slice(-500));
        setConnected(true);
      }
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch of all logs
    poll();
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const filtered =
    filter === "all" ? logs : logs.filter((l) => l.category === filter);

  const categories = ["all", "stagehand", "llm", "navigation", "orchestrator", "navigator", "error"];

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      style={{
        background: "var(--color-resite-black, #030305)",
        color: "#e5e5e5",
        fontFamily: "var(--font-mono, 'JetBrains Mono'), 'Fira Code', monospace",
        fontSize: "12px",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexShrink: 0,
          background: "var(--color-resite-dark, #08080c)",
        }}
      >
        <span
          style={{
            color: "var(--color-resite-cyan, #00e5ff)",
            fontWeight: 700,
            fontSize: "14px",
            fontFamily: "var(--font-display, 'Oxanium'), sans-serif",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          ReSite DEV
        </span>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: connected
              ? "var(--color-resite-green, #00ff6a)"
              : "#f87171",
            boxShadow: connected ? "0 0 6px rgba(0,255,106,0.4)" : "none",
            display: "inline-block",
          }}
          title={connected ? "Polling active" : "Disconnected"}
        />
        <span style={{ color: "var(--color-resite-muted, #505068)" }}>|</span>

        {/* Category filters */}
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: "2px 8px",
              borderRadius: "4px",
              border: "1px solid",
              borderColor: filter === cat
                ? (CATEGORY_COLORS[cat] || "var(--color-resite-cyan, #00e5ff)")
                : "rgba(255,255,255,0.08)",
              background: filter === cat
                ? "rgba(255,255,255,0.04)"
                : "transparent",
              color: filter === cat
                ? (CATEGORY_COLORS[cat] || "var(--color-resite-cyan, #00e5ff)")
                : "var(--color-resite-muted, #505068)",
              cursor: "pointer",
              fontSize: "11px",
              textTransform: "uppercase",
              fontFamily: "var(--font-display, 'Oxanium'), sans-serif",
              letterSpacing: "0.05em",
            }}
          >
            {cat}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <span
          style={{
            color: "var(--color-resite-muted, #505068)",
            fontSize: "11px",
          }}
        >
          {filtered.length} entries
        </span>

        <button
          onClick={() => setAutoScroll((p) => !p)}
          style={{
            padding: "2px 8px",
            borderRadius: "4px",
            border: "1px solid",
            borderColor: autoScroll
              ? "var(--color-resite-yellow, #d4ff00)"
              : "rgba(255,255,255,0.08)",
            background: autoScroll
              ? "rgba(212,255,0,0.06)"
              : "transparent",
            color: autoScroll
              ? "var(--color-resite-yellow, #d4ff00)"
              : "var(--color-resite-muted, #505068)",
            cursor: "pointer",
            fontSize: "11px",
            fontFamily: "var(--font-display, 'Oxanium'), sans-serif",
            letterSpacing: "0.05em",
          }}
        >
          AUTO-SCROLL {autoScroll ? "ON" : "OFF"}
        </button>

        <button
          onClick={async () => {
            try { await fetch("/api/dev-logs", { method: "DELETE" }); } catch { /* ignore */ }
            setLogs([]);
            lastIdRef.current = 0;
          }}
          style={{
            padding: "2px 8px",
            borderRadius: "4px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "transparent",
            color: "var(--color-resite-muted, #505068)",
            cursor: "pointer",
            fontSize: "11px",
            fontFamily: "var(--font-display, 'Oxanium'), sans-serif",
            letterSpacing: "0.05em",
          }}
        >
          CLEAR
        </button>
      </div>

      {/* Log entries */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 0",
        }}
      >
        {filtered.length === 0 && (
          <div
            style={{
              color: "var(--color-resite-muted, #505068)",
              padding: "40px",
              textAlign: "center",
            }}
          >
            Waiting for logs... Trigger a browser action to see activity here.
          </div>
        )}
        {filtered.map((entry) => {
          const catColor = CATEGORY_COLORS[entry.category] || "#999";
          const isExpanded = expandedIds.has(entry.id);
          const hasData = entry.data && Object.keys(entry.data).length > 0;
          const isError = entry.level === "error" || entry.level === "warn";

          return (
            <div
              key={entry.id}
              onClick={() => hasData && toggleExpand(entry.id)}
              style={{
                padding: "3px 16px",
                borderLeft: `3px solid ${catColor}`,
                cursor: hasData ? "pointer" : "default",
                background: isError
                  ? "rgba(248, 113, 113, 0.04)"
                  : isExpanded
                  ? "rgba(255,255,255,0.02)"
                  : "transparent",
                lineHeight: "1.6",
              }}
            >
              {/* Main line */}
              <span style={{ color: "var(--color-resite-muted, #505068)" }}>
                {formatTime(entry.timestamp)}
              </span>
              {" "}
              <span
                style={{
                  color: isError ? "#f87171" : "var(--color-resite-muted, #505068)",
                  fontWeight: isError ? 700 : 400,
                }}
              >
                {LEVEL_ICONS[entry.level] || entry.level}
              </span>
              {" "}
              <span
                style={{
                  color: catColor,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  fontSize: "10px",
                  padding: "1px 4px",
                  borderRadius: "2px",
                  background: `${catColor}15`,
                }}
              >
                {entry.category}
              </span>
              {" "}
              <span style={{ color: "rgba(255,255,255,0.8)" }}>{entry.title}</span>
              {entry.durationMs != null && (
                <span
                  style={{
                    color: entry.durationMs > 5000
                      ? "var(--color-resite-gold, #ffbe0b)"
                      : "var(--color-resite-muted, #505068)",
                    marginLeft: "8px",
                  }}
                >
                  {entry.durationMs}ms
                </span>
              )}
              {hasData && !isExpanded && (
                <span
                  style={{
                    color: "rgba(255,255,255,0.15)",
                    marginLeft: "6px",
                  }}
                >
                  {" "}+data
                </span>
              )}

              {/* Expanded data */}
              {hasData && isExpanded && (
                <pre
                  style={{
                    color: "rgba(255,255,255,0.6)",
                    margin: "4px 0 4px 20px",
                    padding: "8px",
                    background: "var(--color-resite-surface, #0c0c12)",
                    borderRadius: "4px",
                    border: "1px solid rgba(255,255,255,0.06)",
                    overflow: "auto",
                    maxHeight: "300px",
                    fontSize: "11px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {JSON.stringify(entry.data, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
