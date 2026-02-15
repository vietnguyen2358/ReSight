"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useGideon } from "@/components/providers/GideonProvider";
import type { ThoughtEntry } from "@/components/providers/GideonProvider";

type VoiceState = "idle" | "recording" | "transcribing" | "orchestrating" | "speaking";

function shouldIgnoreUtterance(utterance: string): boolean {
  const normalized = utterance.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "...") return true;
  if (normalized.length < 2) return true;
  return false;
}

/** Build a context-aware progress message from recent agent thoughts. */
function buildContextUpdate(thoughts: ThoughtEntry[]): string {
  // Find the most recent non-Voice thought with substance
  const recent = thoughts.slice(-10);
  const relevant = [...recent]
    .reverse()
    .find((t) => t.agent !== "Voice" && t.message.length > 10);

  if (!relevant) return "Still working on that, hang tight.";

  const msg = relevant.message.toLowerCase();

  // Match against common agent activity patterns
  if (msg.includes("navigat") || msg.includes("going to") || msg.includes("loading"))
    return "Still loading the page, one moment...";
  if (msg.includes("screenshot") || msg.includes("image") || msg.includes("looking at"))
    return "Still looking at what's on screen...";
  if (msg.includes("extract") || msg.includes("reading") || msg.includes("scanning"))
    return "Still reading through the page...";
  if (msg.includes("search") || msg.includes("finding") || msg.includes("looking for"))
    return "Still searching, almost there...";
  if (msg.includes("click") || msg.includes("interact") || msg.includes("pressing"))
    return "Interacting with the page right now...";
  if (msg.includes("login") || msg.includes("sign in") || msg.includes("password"))
    return "Working through the login process...";
  if (msg.includes("captcha") || msg.includes("verify") || msg.includes("bot"))
    return "Dealing with a verification step...";
  if (msg.includes("price") || msg.includes("cost") || msg.includes("buy") || msg.includes("cart"))
    return "Looking at pricing and product details...";
  if (msg.includes("coffee") || msg.includes("restaurant") || msg.includes("food") || msg.includes("store"))
    return `Still checking out ${msg.includes("coffee") ? "coffee" : "store"} options...`;

  // Fallback: paraphrase the latest thought directly
  const short = relevant.message.length > 50
    ? relevant.message.slice(0, 50) + "..."
    : relevant.message;
  return `Still working — ${short}`;
}

export default function VoiceManager() {
  const { setStatus, addThought, thoughts } = useGideon();
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const voiceStateRef = useRef<VoiceState>("idle");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastToggleAt = useRef(0);
  const lastHandledUtterance = useRef("");
  const actionInFlight = useRef(false);

  // Progress speech tracking
  const lastSpokenThoughtId = useRef("");
  const lastSpokenAt = useRef(0);

  // Keep ref in sync with state for use in callbacks
  const updateState = useCallback((next: VoiceState) => {
    voiceStateRef.current = next;
    setVoiceState(next);
  }, []);

  const addVoiceThought = useCallback(
    (message: string) => addThought("Voice", message),
    [addThought]
  );

  // ── Play audio from /api/tts (ElevenLabs/Deepgram), with Web Speech fallback ──
  const playTTS = useCallback(
    async (text: string): Promise<void> => {
      // Cancel any running Web Speech first
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

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
    []
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
    (text: string) => {
      lastSpokenAt.current = Date.now();
      playTTS(text).catch(() => {});
    },
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

      // Immediate spoken acknowledgment so user knows we heard them
      speakAck();

      try {
        const res = await fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction }),
        });
        const result = await res.json();
        const message = result?.message || "Action completed.";

        // Speak the response
        await speakResponse(message);
      } catch (error) {
        addVoiceThought(
          `Action error: ${error instanceof Error ? error.message : "Unknown"}`
        );
        updateState("idle");
        setStatus("idle");
      } finally {
        actionInFlight.current = false;
      }
    },
    [addVoiceThought, setStatus, updateState, speakResponse, speakAck]
  );

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

      try {
        const formData = new FormData();
        formData.append("audio", blob, "recording.webm");

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
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
      // Interrupt playback
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      updateState("idle");
      setStatus("idle");
    }
    // Ignore toggle during transcribing/orchestrating
  }, [startRecording, stopRecording, updateState, setStatus]);

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

  // ── Speak Narrator "thinking" thoughts as progress updates via TTS ──
  // IMPORTANT: Skip "answer" type thoughts — those are long final responses
  // that will be duplicated by the orchestrator's return value (speakResponse).
  // Speaking both would burn double ElevenLabs credits for the same content.
  useEffect(() => {
    if (voiceState !== "orchestrating") return;
    if (thoughts.length === 0) return;

    const latest = thoughts[thoughts.length - 1];

    // Don't re-speak the same thought
    if (latest.id === lastSpokenThoughtId.current) return;

    // Only speak Narrator thoughts (user-facing narration)
    if (latest.agent !== "Narrator") return;

    // Skip "answer" type — these are the full responses that speakResponse will handle
    if (latest.type === "answer") return;

    // Throttle: min 8s between spoken updates
    const now = Date.now();
    if (now - lastSpokenAt.current < 8000) return;

    lastSpokenThoughtId.current = latest.id;
    speakProgress(latest.message);
  }, [voiceState, thoughts, speakProgress]);

  // ── Fallback: context-aware progress updates every 10s if quiet ──
  useEffect(() => {
    if (voiceState !== "orchestrating") return;

    const interval = setInterval(() => {
      if (voiceStateRef.current !== "orchestrating") return;

      // Only speak if no update was spoken recently
      const now = Date.now();
      if (now - lastSpokenAt.current < 8000) return;

      // Build a context-aware message from the latest agent thought
      const msg = buildContextUpdate(thoughts);
      speakProgress(msg);
    }, 10000);

    return () => clearInterval(interval);
  }, [voiceState, speakProgress, thoughts]);

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
