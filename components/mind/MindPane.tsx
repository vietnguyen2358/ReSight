"use client";

import GideonSphere from "./GideonSphere";
import ChatPanel from "./ChatPanel";
import SpeakButton from "./SpeakButton";
import VoiceManager from "@/components/voice/VoiceManager";
import { useGideon } from "@/components/providers/GideonProvider";

const hasElevenLabs = !!process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

const STATUS_LABEL: Record<string, string> = {
  idle: "Standing By",
  listening: "Listening",
  thinking: "Processing",
  speaking: "Speaking",
};

const STATUS_DOT_CLASS: Record<string, string> = {
  idle: "bg-gideon-cyan",
  listening: "bg-gideon-green animate-pulse",
  thinking: "bg-gideon-gold animate-pulse",
  speaking: "bg-gideon-yellow animate-pulse",
};

export default function MindPane() {
  const { status } = useGideon();

  return (
    <div className="flex flex-col h-full bg-gideon-black relative overflow-hidden">
      {hasElevenLabs && <VoiceManager />}

      {/* ── Header ── */}
      <div className="flex-none relative z-10">
        {/* Top accent line */}
        <div
          className="h-[1px] w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, var(--color-gideon-cyan) 20%, var(--color-gideon-yellow) 50%, var(--color-gideon-cyan) 80%, transparent 100%)",
            opacity: 0.4,
          }}
        />

        <div className="flex items-center gap-4 px-5 py-3">
          {/* Sphere as compact status orb */}
          <div className="relative w-11 h-11 flex-none">
            <GideonSphere />
            {/* Glow ring around sphere */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: `0 0 12px 2px ${
                  status === "thinking"
                    ? "rgba(255,215,0,0.3)"
                    : status === "listening"
                      ? "rgba(0,255,102,0.3)"
                      : "rgba(0,255,255,0.15)"
                }`,
              }}
            />
          </div>

          {/* Title + Status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1
                className="text-sm font-bold tracking-[0.3em] uppercase"
                style={{ color: "var(--color-gideon-yellow)" }}
              >
                Gideon
              </h1>
              <span
                className="text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-sm"
                style={{
                  color: "var(--color-gideon-muted)",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                v0.1
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT_CLASS[status] || STATUS_DOT_CLASS.idle}`} />
              <span
                className="text-[10px] uppercase tracking-[0.15em]"
                style={{ color: "var(--color-gideon-muted)" }}
              >
                {STATUS_LABEL[status] || "Standing By"}
              </span>
            </div>
          </div>

          {/* Agent council indicator */}
          <div className="flex-none flex items-center gap-1">
            {["O", "N", "S", "G"].map((letter, i) => (
              <div
                key={letter}
                className="w-5 h-5 flex items-center justify-center rounded-sm text-[8px] font-bold"
                style={{
                  background:
                    status === "thinking" && i < 2
                      ? "rgba(0,255,255,0.15)"
                      : "rgba(255,255,255,0.03)",
                  border: `1px solid ${
                    status === "thinking" && i < 2
                      ? "rgba(0,255,255,0.3)"
                      : "rgba(255,255,255,0.06)"
                  }`,
                  color:
                    status === "thinking" && i < 2
                      ? "var(--color-gideon-cyan)"
                      : "var(--color-gideon-muted)",
                  transition: "all 0.3s ease",
                }}
                title={
                  ["Orchestrator", "Navigator", "Scribe", "Guardian"][i]
                }
              >
                {letter}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom border */}
        <div
          className="h-[1px] w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)",
          }}
        />
      </div>

      {/* ── Main Content: Unified Chat + Thoughts ── */}
      <div className="flex-1 overflow-hidden relative">
        {hasElevenLabs ? (
          <div className="flex flex-col h-full items-center justify-center gap-6 px-6">
            <SpeakButton />
          </div>
        ) : (
          <ChatPanel />
        )}
      </div>
    </div>
  );
}
