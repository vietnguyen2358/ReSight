"use client";

import { useEffect, useRef, useState } from "react";

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
  stagehand: "#a78bfa",   // purple
  llm: "#60a5fa",         // blue
  navigation: "#34d399",  // green
  orchestrator: "#fbbf24", // yellow
  navigator: "#f97316",   // orange
  error: "#f87171",       // red
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource("/api/dev-logs");
    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data) as DevLogEntry;
        setLogs((prev) => [...prev.slice(-499), entry]);
      } catch {
        // ignore
      }
    };
    return () => es.close();
  }, []);

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
        background: "#0a0a0a",
        color: "#e5e5e5",
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
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
          borderBottom: "1px solid #262626",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "#ccff00", fontWeight: 700, fontSize: "14px" }}>
          GIDEON DEV
        </span>
        <span style={{ color: "#525252" }}>|</span>

        {/* Category filters */}
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: "2px 8px",
              borderRadius: "4px",
              border: "1px solid",
              borderColor: filter === cat ? (CATEGORY_COLORS[cat] || "#ccff00") : "#333",
              background: filter === cat ? "#1a1a1a" : "transparent",
              color: filter === cat ? (CATEGORY_COLORS[cat] || "#ccff00") : "#737373",
              cursor: "pointer",
              fontSize: "11px",
              textTransform: "uppercase",
            }}
          >
            {cat}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <span style={{ color: "#525252", fontSize: "11px" }}>
          {filtered.length} entries
        </span>

        <button
          onClick={() => setAutoScroll((p) => !p)}
          style={{
            padding: "2px 8px",
            borderRadius: "4px",
            border: "1px solid",
            borderColor: autoScroll ? "#ccff00" : "#333",
            background: autoScroll ? "#1a1a0a" : "transparent",
            color: autoScroll ? "#ccff00" : "#737373",
            cursor: "pointer",
            fontSize: "11px",
          }}
        >
          AUTO-SCROLL {autoScroll ? "ON" : "OFF"}
        </button>

        <button
          onClick={() => setLogs([])}
          style={{
            padding: "2px 8px",
            borderRadius: "4px",
            border: "1px solid #333",
            background: "transparent",
            color: "#737373",
            cursor: "pointer",
            fontSize: "11px",
          }}
        >
          CLEAR
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 0",
        }}
      >
        {filtered.length === 0 && (
          <div style={{ color: "#525252", padding: "40px", textAlign: "center" }}>
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
                  ? "rgba(248, 113, 113, 0.05)"
                  : isExpanded
                  ? "rgba(255,255,255,0.02)"
                  : "transparent",
                lineHeight: "1.6",
              }}
            >
              {/* Main line */}
              <span style={{ color: "#525252" }}>{formatTime(entry.timestamp)}</span>
              {" "}
              <span
                style={{
                  color: isError ? "#f87171" : "#525252",
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
              <span style={{ color: "#d4d4d4" }}>{entry.title}</span>
              {entry.durationMs != null && (
                <span
                  style={{
                    color: entry.durationMs > 5000 ? "#f97316" : "#525252",
                    marginLeft: "8px",
                  }}
                >
                  {entry.durationMs}ms
                </span>
              )}
              {hasData && !isExpanded && (
                <span style={{ color: "#404040", marginLeft: "6px" }}>
                  {" "}+data
                </span>
              )}

              {/* Expanded data */}
              {hasData && isExpanded && (
                <pre
                  style={{
                    color: "#a3a3a3",
                    margin: "4px 0 4px 20px",
                    padding: "8px",
                    background: "#141414",
                    borderRadius: "4px",
                    border: "1px solid #262626",
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
