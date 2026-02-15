"use client";

import { useReSight } from "@/components/providers/ReSightProvider";
import { MovingBorder } from "@/components/ui/moving-border";

export default function SpeakButton() {
  const { status } = useReSight();

  const isListening = status === "listening";
  const isThinking = status === "thinking";

  const colors = isListening
    ? ["#00ff6a", "#00e5ff", "#00ff6a", "#00e5ff"]
    : isThinking
      ? ["#ffbe0b", "#d4ff00", "#ffbe0b", "#d4ff00"]
      : ["#d4ff00", "#00e5ff", "#d4ff00", "#00e5ff"];

  return (
    <MovingBorder
      duration={isListening ? 1500 : isThinking ? 2000 : 4000}
      borderRadius="9999px"
      colors={colors}
      containerClassName="inline-block"
      className={`
        px-8 py-4 text-sm font-semibold uppercase tracking-[0.25em]
        flex items-center gap-3 select-none
        ${
          isListening
            ? "text-resight-green"
            : isThinking
              ? "text-resight-gold"
              : "text-resight-yellow"
        }
      `}
      style={{
        fontFamily: "var(--font-display)",
        background: isListening
          ? "rgba(0,255,106,0.06)"
          : isThinking
            ? "rgba(255,190,11,0.05)"
            : "rgba(8,8,12,0.9)",
      }}
    >
      <button
        id="speak-button"
        className="flex items-center gap-3 cursor-pointer bg-transparent border-none outline-none"
        style={{
          fontFamily: "var(--font-display)",
          color: "inherit",
          fontSize: "inherit",
          fontWeight: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit" as "uppercase",
        }}
      >
        {/* Waveform bars when listening */}
        {isListening && (
          <div className="flex items-end gap-[2px] h-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-[2px] rounded-full bg-resight-green"
                style={{
                  height: "100%",
                  animation: `waveform-${(i % 3) + 1} ${0.5 + i * 0.08}s ease-in-out ${i * 0.05}s infinite`,
                  opacity: 0.7,
                }}
              />
            ))}
          </div>
        )}

        {/* Thinking spinner */}
        {isThinking && (
          <div
            className="w-4 h-4 rounded-full border border-resight-gold/40"
            style={{
              borderTopColor: "var(--color-resight-gold)",
              animation: "orbit-spin 1s linear infinite",
            }}
          />
        )}

        <span>
          {isListening
            ? "Listening"
            : isThinking
              ? "Processing"
              : "Press Space"}
        </span>
      </button>
    </MovingBorder>
  );
}
