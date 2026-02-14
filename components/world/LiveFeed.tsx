"use client";

import { useGideon } from "@/components/providers/GideonProvider";
import OverlayBox from "./OverlayBox";

export default function LiveFeed() {
  const { latestScreenshot, boundingBoxes } = useGideon();

  if (!latestScreenshot) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-gideon-muted text-6xl mb-4">&#x25C9;</div>
          <p className="text-gideon-muted text-sm font-mono">
            No active browser session
          </p>
          <p className="text-gideon-muted/50 text-xs font-mono mt-1">
            Send a voice command to begin
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/jpeg;base64,${latestScreenshot}`}
        alt="Browser screenshot"
        className="max-w-full max-h-full object-contain"
      />

      {/* Overlay bounding boxes */}
      {boundingBoxes.map((box, i) => (
        <OverlayBox key={i} box={box} />
      ))}
    </div>
  );
}
