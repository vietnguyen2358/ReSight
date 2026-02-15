"use client";

import { useMemo, useState, useEffect } from "react";
import { useGideon } from "@/components/providers/GideonProvider";

// ── Node definitions ──
const NODES = [
  { id: "Navigator",    short: "N", label: "NAVIGATOR",    x: 60,  y: 26, color: "#00ff6a" },
  { id: "Orchestrator", short: "O", label: "ORCHESTRATOR", x: 150, y: 26, color: "#00e5ff" },
  { id: "Guardian",     short: "G", label: "GUARDIAN",     x: 240, y: 26, color: "#ff4757" },
  { id: "Scribe",       short: "S", label: "SCRIBE",       x: 150, y: 70, color: "#ffbe0b" },
] as const;

// ── Edge definitions (hub-spoke from Orchestrator) ──
const EDGES = [
  { from: "Orchestrator", to: "Navigator", id: "o-n" },
  { from: "Orchestrator", to: "Guardian",  id: "o-g" },
  { from: "Orchestrator", to: "Scribe",    id: "o-s" },
] as const;

const NODE_MAP = Object.fromEntries(NODES.map((n) => [n.id, n]));
const KNOWN_AGENTS: Set<string> = new Set(NODES.map((n) => n.id));
const R = 13; // node radius
const RECENCY_MS = 8000;

/** Map thought agent names to graph node IDs */
function resolveAgents(agent: string): string[] {
  if (agent.includes("→")) {
    return agent.split("→").map((s) => s.trim());
  }
  if (agent === "Narrator") return ["Navigator"];
  return [agent];
}

/** Calculate edge start/end points (clipped to circle edge) */
function edgeCoords(fromId: string, toId: string) {
  const f = NODE_MAP[fromId];
  const t = NODE_MAP[toId];
  const dx = t.x - f.x;
  const dy = t.y - f.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  return {
    x1: f.x + (dx / len) * R,
    y1: f.y + (dy / len) * R,
    x2: t.x - (dx / len) * R,
    y2: t.y - (dy / len) * R,
  };
}

export default function AgentGraph() {
  const { thoughts, status } = useGideon();

  // 1-second tick to age out stale active states
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Derive active agents from recent thoughts
  const { activeAgents, activeEdges } = useMemo(() => {
    const now = Date.now();
    const active = new Set<string>();

    // Orchestrator always lights up while processing
    if (status === "thinking") {
      active.add("Orchestrator");
    }

    // Scan recent thoughts
    for (let i = thoughts.length - 1; i >= 0; i--) {
      const t = thoughts[i];
      if (now - t.timestamp > RECENCY_MS) break;

      for (const a of resolveAgents(t.agent)) {
        if (KNOWN_AGENTS.has(a)) active.add(a);
      }
    }

    // If any non-Orchestrator agent is active, ensure Orchestrator is too
    if (active.size > 0) active.add("Orchestrator");

    // Active edges = both endpoints active
    const edges = new Set(
      EDGES.filter((e) => active.has(e.from) && active.has(e.to)).map((e) => e.id)
    );

    return { activeAgents: active, activeEdges: edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thoughts, status, tick]);

  const anyActive = activeAgents.size > 0;

  return (
    <div
      className="flex-none relative"
      style={{
        padding: "6px 16px 2px",
        background: "rgba(8,8,12,0.4)",
        borderBottom: "1px solid rgba(255,255,255,0.03)",
      }}
    >
      {/* Label */}
      <div
        className="absolute top-1.5 right-4 text-[8px] uppercase tracking-[0.2em]"
        style={{
          fontFamily: "var(--font-display)",
          color: anyActive ? "rgba(0,229,255,0.4)" : "rgba(255,255,255,0.08)",
          transition: "color 0.5s ease",
        }}
      >
        Agent Council
      </div>

      <svg
        viewBox="0 0 300 96"
        className="w-full"
        style={{ maxWidth: 420, margin: "0 auto", display: "block" }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Inline keyframes for SVG animations */}
        <defs>
          <style>{`
            @keyframes ag-dash { to { stroke-dashoffset: -16; } }
            @keyframes ag-pulse { 0%,100% { opacity: 0.12; } 50% { opacity: 0.3; } }
            @keyframes ag-ring { 0%,100% { r: ${R + 3}; opacity: 0.3; } 50% { r: ${R + 6}; opacity: 0; } }
          `}</style>
        </defs>

        {/* ── Edges ── */}
        {EDGES.map((edge) => {
          const { x1, y1, x2, y2 } = edgeCoords(edge.from, edge.to);
          const isActive = activeEdges.has(edge.id);
          const toNode = NODE_MAP[edge.to];

          return (
            <g key={edge.id}>
              {/* Base line (always visible, very dim) */}
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={0.5}
              />
              {/* Active overlay */}
              {isActive && (
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={toNode.color}
                  strokeWidth={1.5}
                  strokeDasharray="3 13"
                  strokeLinecap="round"
                  opacity={0.7}
                  style={{ animation: "ag-dash 0.8s linear infinite" }}
                />
              )}
            </g>
          );
        })}

        {/* ── Nodes ── */}
        {NODES.map((node) => {
          const isActive = activeAgents.has(node.id);

          return (
            <g key={node.id}>
              {/* Pulse ring (active only) */}
              {isActive && (
                <circle
                  cx={node.x} cy={node.y}
                  r={R + 4}
                  fill="none"
                  stroke={node.color}
                  strokeWidth={1}
                  style={{ animation: "ag-ring 2s ease-in-out infinite" }}
                />
              )}

              {/* Glow (active only) */}
              {isActive && (
                <circle
                  cx={node.x} cy={node.y}
                  r={R + 2}
                  fill={node.color}
                  style={{ animation: "ag-pulse 2s ease-in-out infinite" }}
                />
              )}

              {/* Main circle */}
              <circle
                cx={node.x} cy={node.y}
                r={R}
                fill={isActive ? `${node.color}18` : "rgba(255,255,255,0.015)"}
                stroke={isActive ? node.color : "rgba(255,255,255,0.06)"}
                strokeWidth={isActive ? 1.5 : 0.8}
                style={{
                  transition: "fill 0.4s ease, stroke 0.4s ease, stroke-width 0.3s ease",
                  filter: isActive ? `drop-shadow(0 0 4px ${node.color}80)` : "none",
                }}
              />

              {/* Letter inside circle */}
              <text
                x={node.x} y={node.y + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={isActive ? node.color : "rgba(255,255,255,0.15)"}
                fontSize={10}
                fontWeight={700}
                fontFamily="var(--font-display)"
                style={{ transition: "fill 0.4s ease" }}
              >
                {node.short}
              </text>

              {/* Label below circle */}
              <text
                x={node.x}
                y={node.y + R + 11}
                textAnchor="middle"
                fill={isActive ? `${node.color}BB` : "rgba(255,255,255,0.07)"}
                fontSize={6.5}
                fontFamily="var(--font-display)"
                letterSpacing={1.2}
                style={{ transition: "fill 0.5s ease" }}
              >
                {node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
