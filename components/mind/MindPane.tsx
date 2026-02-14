"use client";

import GideonSphere from "./GideonSphere";
import ChatPanel from "./ChatPanel";
import SpeakButton from "./SpeakButton";
import VoiceManager from "@/components/voice/VoiceManager";
import { useGideon } from "@/components/providers/GideonProvider";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { SparklesCore } from "@/components/ui/sparkles";

const hasElevenLabs = !!process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

const STATUS_CONFIG: Record<string, { label: string; color: string; dotClass: string; sparkleColor: string }> = {
  idle: {
    label: "Standing By",
    color: "var(--color-gideon-cyan)",
    dotClass: "bg-gideon-cyan",
    sparkleColor: "#00e5ff",
  },
  listening: {
    label: "Listening",
    color: "var(--color-gideon-green)",
    dotClass: "bg-gideon-green",
    sparkleColor: "#00ff6a",
  },
  thinking: {
    label: "Processing",
    color: "var(--color-gideon-gold)",
    dotClass: "bg-gideon-gold",
    sparkleColor: "#ffbe0b",
  },
  speaking: {
    label: "Speaking",
    color: "var(--color-gideon-yellow)",
    dotClass: "bg-gideon-yellow",
    sparkleColor: "#d4ff00",
  },
};

const AGENTS = [
  { letter: "O", name: "Orchestrator" },
  { letter: "N", name: "Navigator" },
  { letter: "S", name: "Scribe" },
  { letter: "G", name: "Guardian" },
];

export default function MindPane() {
  const { status } = useGideon();
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const isActive = status === "thinking" || status === "listening";

  return (
    <div className="flex flex-col h-full bg-gideon-black relative overflow-hidden">
      {hasElevenLabs && <VoiceManager />}

      {/* Aceternity background beams */}
      <BackgroundBeams className="opacity-30" />

      {/* ── Header ── */}
      <div className="flex-none relative z-10">
        {/* Top accent line with shimmer */}
        <div className="h-[1px] w-full relative overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.15) 20%, rgba(212,255,0,0.25) 50%, rgba(0,229,255,0.15) 80%, transparent 100%)",
            }}
          />
          <div
            className="absolute inset-0 w-1/3"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
              animation: "shimmer 4s ease-in-out infinite",
            }}
          />
        </div>

        <div className="flex items-center gap-4 px-5 py-3.5">
          {/* Sphere with sparkles overlay */}
          <div className="relative w-12 h-12 flex-none">
            <GideonSphere />
            {/* Sparkles around sphere */}
            <div className="absolute -inset-2 pointer-events-none">
              <SparklesCore
                particleColor={config.sparkleColor}
                particleDensity={isActive ? 60 : 20}
                minSize={0.3}
                maxSize={0.8}
                speed={isActive ? 1.5 : 0.5}
              />
            </div>
            {/* Orbit ring */}
            <div
              className="absolute pointer-events-none"
              style={{
                inset: "-5px",
                borderRadius: "50%",
                border: `1px solid ${isActive ? config.color : "rgba(0,229,255,0.1)"}`,
                animation: isActive ? "orbit-spin 8s linear infinite" : "none",
                opacity: isActive ? 0.5 : 0.2,
                transition: "opacity 0.5s ease, border-color 0.5s ease",
              }}
            />
            {/* Second orbit ring — counter-rotating */}
            <div
              className="absolute pointer-events-none"
              style={{
                inset: "-9px",
                borderRadius: "50%",
                border: `1px dashed ${isActive ? config.color : "rgba(0,229,255,0.05)"}`,
                animation: isActive ? "orbit-spin 12s linear infinite reverse" : "none",
                opacity: isActive ? 0.3 : 0.1,
                transition: "opacity 0.5s ease",
              }}
            />
          </div>

          {/* Title + Status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1
                className="text-[15px] font-bold tracking-[0.35em] uppercase"
                style={{
                  fontFamily: "var(--font-display)",
                  background: "linear-gradient(90deg, var(--color-gideon-yellow) 0%, var(--color-gideon-cyan) 100%)",
                  backgroundClip: "text",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundSize: "200% 100%",
                  animation: "text-shimmer 6s ease-in-out infinite",
                }}
              >
                Gideon
              </h1>
              <span
                className="text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-md"
                style={{
                  fontFamily: "var(--font-display)",
                  color: "var(--color-gideon-muted)",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                v0.1
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <div
                className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`}
                style={{
                  animation: isActive ? "dot-breathe 1.5s ease-in-out infinite" : "none",
                  boxShadow: isActive ? `0 0 6px ${config.color}` : "none",
                }}
              />
              <span
                className="text-[10px] uppercase tracking-[0.2em]"
                style={{
                  fontFamily: "var(--font-display)",
                  color: isActive ? config.color : "var(--color-gideon-muted)",
                  transition: "color 0.3s ease",
                }}
              >
                {config.label}
              </span>
            </div>
          </div>

          {/* Agent council */}
          <div className="flex-none flex items-center gap-1.5">
            {AGENTS.map((agent, i) => {
              const isAgentActive = status === "thinking" && i < 2;
              return (
                <div
                  key={agent.letter}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-[9px] font-semibold transition-all duration-500"
                  style={{
                    fontFamily: "var(--font-display)",
                    background: isAgentActive
                      ? "rgba(0,229,255,0.08)"
                      : "rgba(255,255,255,0.02)",
                    border: `1px solid ${
                      isAgentActive
                        ? "rgba(0,229,255,0.25)"
                        : "rgba(255,255,255,0.04)"
                    }`,
                    color: isAgentActive
                      ? "var(--color-gideon-cyan)"
                      : "var(--color-gideon-muted)",
                    boxShadow: isAgentActive
                      ? "0 0 10px rgba(0,229,255,0.08)"
                      : "none",
                  }}
                  title={agent.name}
                >
                  {agent.letter}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom border */}
        <div
          className="h-[1px] w-full"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent 100%)",
          }}
        />
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-hidden relative z-10">
        <ChatPanel />
        {hasElevenLabs && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
            <SpeakButton />
          </div>
        )}
      </div>
    </div>
  );
}
