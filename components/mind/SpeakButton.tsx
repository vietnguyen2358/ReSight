"use client";

import { useGideon } from "@/components/providers/GideonProvider";

export default function SpeakButton() {
  const { status } = useGideon();

  const isListening = status === "listening";
  const isThinking = status === "thinking";

  const label = isListening
    ? "Listening..."
    : isThinking
      ? "Thinking..."
      : "Press Space to Speak";

  return (
    <button
      id="speak-button"
      className={`
        w-full py-6 text-2xl font-bold uppercase tracking-widest
        border-2 transition-all duration-300 cursor-pointer select-none
        ${
          isListening
            ? "bg-gideon-green text-gideon-black border-gideon-green pulse-active"
            : isThinking
              ? "bg-gideon-gold/20 text-gideon-gold border-gideon-gold"
              : "bg-transparent text-gideon-yellow border-gideon-yellow breathe hover:bg-gideon-yellow/10"
        }
      `}
    >
      {label}
    </button>
  );
}
