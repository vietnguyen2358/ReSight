"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useReSight } from "@/components/providers/ReSightProvider";
import type { ThoughtEntry } from "@/components/providers/ReSightProvider";

type VoiceState = "idle" | "recording" | "transcribing" | "orchestrating" | "speaking";

function shouldIgnoreUtterance(utterance: string): boolean {
  const normalized = utterance.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "...") return true;
  if (normalized.length < 2) return true;
  return false;
}

/** Activity code → user-friendly TTS message. No pattern matching on content. */
const ACTIVITY_MESSAGES: Record<string, string> = {
  navigating: "Still loading the page, one moment...",
  loading: "Still loading, give it a sec...",
  acting: "Interacting with the page right now...",
  extracting: "Still reading through the page...",
  searching: "Still searching, almost there...",
  verifying: "Dealing with a verification step...",
  summarizing: "Putting together what I found...",
};

/** Build a context-aware progress message from recent agent thoughts. */
function buildContextUpdate(thoughts: ThoughtEntry[]): string {
  const recent = thoughts.slice(-10);
  const relevant = [...recent]
    .reverse()
    .find((t) => t.agent !== "Voice" && t.message.length > 10);

  if (!relevant) return "Still working on that, hang tight.";

  if (relevant.activity && ACTIVITY_MESSAGES[relevant.activity]) {
    return ACTIVITY_MESSAGES[relevant.activity];
  }

  const short =
    relevant.message.length > 50
      ? relevant.message.slice(0, 50) + "..."
      : relevant.message;
  return `Still working — ${short}`;
}

export default function VoiceManager() {
  const { setStatus, addThought, thoughts, addChatMessage } = useReSight();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const voiceStateRef = useRef<VoiceState>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastToggleAt = useRef(0);
  const lastHandledUtterance = useRef("");
  const actionInFlight = useRef(false);
  const operationAbortRef = useRef<AbortController | null>(null);
  const thoughtsRef = useRef(thoughts);
  const requestTimestampRef = useRef(0);

  useEffect(() => {
    thoughtsRef.current = thoughts;
  }, [thoughts]);

  // Keep ref in sync with state for use in callbacks
  const updateState = useCallback((next: VoiceState) => {
    voiceStateRef.current = next;
    setVoiceState(next);
  }, []);

  const addVoiceThought = useCallback(
    (message: string) => addThought("Voice", message),
    [addThought]
  );

  const stopAllAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // ── Play audio from /api/tts (ElevenLabs/Deepgram), with Web Speech fallback ──
  const playTTS = useCallback(
    async (text: string): Promise<void> => {
      stopAllAudio();

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) throw new Error(`TTS error ${res.status}`);

        const arrayBuf = await res.arrayBuffer();
        const blob = new Blob([arrayBuf], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);

        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            reject(new Error("Audio playback failed"));
          };
          audio.play().catch(reject);
        });
      } catch {
        // Fallback to Web Speech API
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          await new Promise<void>((resolve) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.1;
            utterance.onend = () => resolve();
            utterance.onerror = () => resolve();
            window.speechSynthesis.speak(utterance);
          });
        }
      }
    },
    [stopAllAudio]
  );

  // ── Speak the final response (sets status to speaking → idle) ──
  const speakResponse = useCallback(
    async (text: string) => {
      if (!text || voiceStateRef.current === "idle") return;
      updateState("speaking");
      setStatus("speaking");
      try {
        await playTTS(text);
      } finally {
        updateState("idle");
        setStatus("idle");
      }
    },
    [setStatus, updateState, playTTS]
  );

  // ── Progress update via TTS (fire-and-forget, no state change) ──
  const speakProgress = useCallback(
    (text: string) => playTTS(text).catch(() => {}),
    [playTTS]
  );

  // ── Quick spoken acknowledgment via TTS ──
  const speakAck = useCallback(
    () => {
      const acks = [
        "Got it, working on that.",
        "On it!",
        "Sure, one sec.",
        "Sounds good.",
        "Alright, checking it out.",
        "Let me look into that.",
        "Working on it.",
      ];
      const idx = Math.floor(Math.random() * acks.length);
      speakProgress(acks[idx]);
    },
    [speakProgress]
  );

  // ── Run instruction through orchestrator ──
  const runInstruction = useCallback(
    async (instruction: string) => {
      if (actionInFlight.current) return;
      if (instruction === lastHandledUtterance.current) return;
      if (shouldIgnoreUtterance(instruction)) {
        addVoiceThought("Couldn't catch that, try again");
        updateState("idle");
        setStatus("idle");
        return;
      }

      actionInFlight.current = true;
      lastHandledUtterance.current = instruction;
      updateState("orchestrating");
      setStatus("thinking");
      addVoiceThought(`Executing: "${instruction}"`);

      addChatMessage({ role: "user", text: instruction });
      requestTimestampRef.current = Date.now();

      speakAck();

      const controller = new AbortController();
      operationAbortRef.current = controller;

      try {
        const res = await fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction }),
          signal: controller.signal,
        });
        const result = await res.json();
        const message = result?.message || "Action completed.";

        const capturedThoughts = thoughtsRef.current
          .filter((t) => t.timestamp >= requestTimestampRef.current)
          .map((t) => ({ id: t.id, agent: t.agent, message: t.message, type: t.type }));
        addChatMessage({ role: "assistant", text: message, thoughts: capturedThoughts });

        await speakResponse(message);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown";
        addVoiceThought(`Action error: ${errMsg}`);
        addChatMessage({ role: "assistant", text: `Error: ${errMsg}` });
        updateState("idle");
        setStatus("idle");
      } finally {
        actionInFlight.current = false;
      }
    },
    [addVoiceThought, setStatus, updateState, speakResponse, speakAck, addChatMessage]
  );

  // ── ESC key interrupt for voice mode ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const state = voiceStateRef.current;
      if (state === "idle") return;

      e.preventDefault();

      // Abort in-flight fetch
      if (operationAbortRef.current) {
        operationAbortRef.current.abort();
        operationAbortRef.current = null;
      }

      stopAllAudio();

      // Stop recording without triggering processRecording
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      // Fire server-side stop
      fetch("/api/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: "stop" }),
      }).catch(() => {});

      // Reset state
      actionInFlight.current = false;
      updateState("idle");
      setStatus("idle");
      addVoiceThought("Interrupted");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [updateState, setStatus, addVoiceThought, stopAllAudio]);

  // ── Process recorded audio ──
  const processRecording = useCallback(
    async (blob: Blob) => {
      // Discard very short recordings (likely accidental)
      if (blob.size < 1024) {
        updateState("idle");
        setStatus("idle");
        return;
      }

      updateState("transcribing");
      setStatus("thinking");
      addVoiceThought("Transcribing...");

      const controller = new AbortController();
      operationAbortRef.current = controller;

      try {
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (res.status === 504) {
          addVoiceThought("Transcription timed out, try again");
          updateState("idle");
          setStatus("idle");
          return;
        }
        if (res.status === 429) {
          addVoiceThought("Rate limited, wait a moment");
          updateState("idle");
          setStatus("idle");
          return;
        }
        if (!res.ok) throw new Error(`Transcribe error ${res.status}`);

        const { text } = await res.json();
        if (!text || text.trim().length === 0) {
          addVoiceThought("Couldn't catch that, try again");
          updateState("idle");
          setStatus("idle");
          return;
        }

        addVoiceThought(`Heard: "${text}"`);
        await runInstruction(text);
      } catch (error) {
        addVoiceThought(
          `Transcription error: ${error instanceof Error ? error.message : "Unknown"}`
        );
        updateState("idle");
        setStatus("idle");
      }
    },
    [addVoiceThought, setStatus, updateState, runInstruction]
  );

  // ── Start recording ──
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer webm, fall back to mp4 (Safari)
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        // Stop mic tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        processRecording(blob);
      };

      recorder.start();
      updateState("recording");
      setStatus("listening");
      addVoiceThought("Listening...");
    } catch {
      addVoiceThought("Mic access denied");
      updateState("idle");
      setStatus("idle");
    }
  }, [addVoiceThought, setStatus, updateState, processRecording]);

  // ── Stop recording ──
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── Toggle mic (push-to-toggle) ──
  const toggleMic = useCallback(() => {
    const now = Date.now();
    if (now - lastToggleAt.current < 250) return;
    lastToggleAt.current = now;

    const state = voiceStateRef.current;

    if (state === "idle") {
      startRecording();
    } else if (state === "recording") {
      stopRecording();
    } else if (state === "speaking") {
      stopAllAudio();
      updateState("idle");
      setStatus("idle");
    }
    // Ignore toggle during transcribing/orchestrating
  }, [startRecording, stopRecording, updateState, setStatus, stopAllAudio]);

  // ── Click handler for #speak-button ──
  useEffect(() => {
    const button = document.getElementById("speak-button");
    if (!button) return;
    button.addEventListener("click", toggleMic);
    return () => button.removeEventListener("click", toggleMic);
  }, [toggleMic]);

  // ── Spacebar / Enter keyboard shortcut ──
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

  // ── Progress updates: every 10s while orchestrating, until request finishes ──
  useEffect(() => {
    if (voiceState !== "orchestrating") return;

    const interval = setInterval(() => {
      if (voiceStateRef.current !== "orchestrating") return;
      const msg = buildContextUpdate(thoughtsRef.current);
      speakProgress(msg);
    }, 20000);

    return () => clearInterval(interval);
  }, [voiceState, speakProgress]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return null;
}
