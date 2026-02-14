"use client";

import GideonSphere from "./GideonSphere";
import ThoughtStream from "./ThoughtStream";
import SpeakButton from "./SpeakButton";
import VoiceManager from "@/components/voice/VoiceManager";

export default function MindPane() {
  return (
    <div className="flex flex-col h-full bg-gideon-black p-4">
      <VoiceManager />
      {/* Sphere */}
      <div className="flex-none h-[40%] flex items-center justify-center">
        <GideonSphere />
      </div>

      {/* Thought Stream */}
      <div className="flex-1 overflow-hidden">
        <ThoughtStream />
      </div>

      {/* Speak Button */}
      <div className="flex-none pt-4">
        <SpeakButton />
      </div>
    </div>
  );
}
