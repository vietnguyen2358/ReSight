"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { useGideon } from "@/components/providers/GideonProvider";

type AgentMessage = {
  source?: string;
  role?: string;
  message?: string;
};

function parseAgentMessage(input: unknown): AgentMessage | null {
  if (typeof input === "object" && input !== null) {
    return input as AgentMessage;
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === "object") {
        return parsed as AgentMessage;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function shouldIgnoreUtterance(utterance: string): boolean {
  const normalized = utterance.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "...") return true;
  if (normalized.length < 2) return true;
  return false;
}

export default function VoiceManager() {
  const { setStatus, addThought } = useGideon();
  const [micMuted, setMicMuted] = useState(true);
  const actionInFlight = useRef(false);
  const lastHandledUtterance = useRef<string>("");
  const acceptingToolInstruction = useRef(false);
  const lastToolInstructionAt = useRef(0);
  const lastToggleAt = useRef(0);
  const lastVoiceStatus = useRef<string>("");

  const addVoiceStatus = useCallback(
    (message: string) => {
      if (lastVoiceStatus.current === message) return;
      lastVoiceStatus.current = message;
      addThought("Voice", message);
    },
    [addThought]
  );

  const runInstruction = useCallback(
    async (instruction: string): Promise<string> => {
      if (actionInFlight.current) return "Action already in progress.";
      if (instruction === lastHandledUtterance.current) return "Duplicate instruction ignored.";
      if (shouldIgnoreUtterance(instruction)) return "Ignored empty instruction.";

      actionInFlight.current = true;
      acceptingToolInstruction.current = false;
      lastHandledUtterance.current = instruction;
      setMicMuted(true);
      setStatus("thinking");
      addThought("Voice", `Executing: "${instruction}"`);

      try {
        const res = await fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction }),
        });
        const result = await res.json();
        return result?.message || "Action completed";
      } catch (error) {
        addThought(
          "Voice",
          `Action error: ${error instanceof Error ? error.message : "Unknown"}`
        );
        return `Action error: ${error instanceof Error ? error.message : "Unknown"}`;
      } finally {
        setStatus("idle");
        actionInFlight.current = false;
      }
      return "Action completed";
    },
    [addThought, setStatus]
  );

  const conversation = useConversation({
    micMuted,
    onConnect: () => {
      addVoiceStatus("ElevenLabs connected — mic muted, press Space to talk");
      setStatus("idle");
    },
    onDisconnect: () => {
      addVoiceStatus("ElevenLabs disconnected");
      setStatus("idle");
      setMicMuted(true);
    },
    onMessage: (message) => {
      const parsed = parseAgentMessage(message);

      // Suppress noisy keepalive chatter while an action is running.
      if (parsed?.role === "agent" && actionInFlight.current) {
        return;
      }

      const rendered =
        typeof parsed?.message === "string"
          ? parsed.message
          : typeof message === "string"
            ? message
            : JSON.stringify(message);
      if (/are you still there/i.test(rendered)) {
        return;
      }
      if (parsed?.role === "agent" || typeof message === "string") {
        addThought("Gideon", rendered);
      }
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
      addVoiceStatus("Connecting to ElevenLabs...");
      setStatus("thinking");
      await conversation.startSession({
        agentId,
        connectionType: "websocket",
        clientTools: {
          triggerBrowserAction: async (params: Record<string, unknown>) => {
            if (!acceptingToolInstruction.current) {
              return "Waiting for user input. Press speak and provide a new instruction.";
            }
            const instruction = String(params.instruction || "").trim();
            if (!instruction) return "No instruction received.";
            const now = Date.now();
            if (now - lastToolInstructionAt.current < 3000) {
              return "Instruction already being processed.";
            }
            lastToolInstructionAt.current = now;
            return runInstruction(instruction);
          },
        },
      });
    } catch (error) {
      addThought("Voice", `Failed to connect: ${error instanceof Error ? error.message : "Unknown"}`);
      setStatus("idle");
    }
  }, [conversation, setStatus, addThought, addVoiceStatus]);

  // Toggle mic mute (push-to-talk)
  const toggleMic = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleAt.current < 250) return;
    lastToggleAt.current = now;

    if (conversation.status !== "connected") {
      // First press connects
      connect();
      return;
    }

    setMicMuted((prev) => {
      const next = !prev;
      setStatus(next ? "idle" : "listening");
      addVoiceStatus(next ? "Mic muted" : "Listening...");
      acceptingToolInstruction.current = !next;
      return next;
    });
  }, [conversation.status, connect, setStatus, addVoiceStatus]);

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
        if ((e.target as HTMLElement)?.id === "speak-button") return;
        e.preventDefault();
        toggleMic();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleMic]);

  return null;
}
