"use client";

import { useEffect, useCallback, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { useGideon } from "@/components/providers/GideonProvider";

export default function VoiceManager() {
  const { setStatus, addThought } = useGideon();
  const [micMuted, setMicMuted] = useState(true);

  const conversation = useConversation({
    micMuted,
    onConnect: () => {
      addThought("Voice", "ElevenLabs connected — mic muted, press Space to talk");
      setStatus("idle");
    },
    onDisconnect: () => {
      addThought("Voice", "ElevenLabs disconnected");
      setStatus("idle");
      setMicMuted(true);
    },
    onMessage: (message) => {
      addThought("Gideon", typeof message === "string" ? message : JSON.stringify(message));
    },
    onError: (error) => {
      addThought("Voice", `Error: ${error}`);
      setStatus("idle");
    },
  });

  // Connect to ElevenLabs (one-time)
  const connect = useCallback(async () => {
    const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
    if (!agentId) {
      addThought("Voice", "No ElevenLabs Agent ID configured");
      return;
    }

    try {
      addThought("Voice", "Connecting to ElevenLabs...");
      setStatus("thinking");
      await conversation.startSession({
        agentId,
        connectionType: "websocket",
        clientTools: {
          triggerBrowserAction: async (params: Record<string, unknown>) => {
            const instruction = (params.instruction as string) || "";
            addThought("Voice", `Triggering: "${instruction}"`);
            setStatus("thinking");

            try {
              const res = await fetch("/api/orchestrator", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ instruction }),
              });
              const result = await res.json();
              setStatus("speaking");
              return result.message || "Action completed";
            } catch (error) {
              setStatus("idle");
              return `Error: ${error instanceof Error ? error.message : "Unknown"}`;
            }
          },
        },
      });
    } catch (error) {
      addThought("Voice", `Failed to connect: ${error instanceof Error ? error.message : "Unknown"}`);
      setStatus("idle");
    }
  }, [conversation, setStatus, addThought]);

  // Toggle mic mute (push-to-talk)
  const toggleMic = useCallback(() => {
    if (conversation.status !== "connected") {
      // First press connects
      connect();
      return;
    }

    setMicMuted((prev) => {
      const next = !prev;
      setStatus(next ? "idle" : "listening");
      addThought("Voice", next ? "Mic muted" : "Listening...");
      return next;
    });
  }, [conversation.status, connect, setStatus, addThought]);

  // Click handler for the speak button
  useEffect(() => {
    const button = document.getElementById("speak-button");
    if (!button) return;
    button.addEventListener("click", toggleMic);
    return () => button.removeEventListener("click", toggleMic);
  }, [toggleMic]);

  // Spacebar / Enter keyboard shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "Enter") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        toggleMic();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleMic]);

  return null;
}
