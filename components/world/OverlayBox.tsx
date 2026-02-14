"use client";

import type { BoundingBox } from "@/components/providers/GideonProvider";

interface OverlayBoxProps {
  box: BoundingBox;
}

export default function OverlayBox({ box }: OverlayBoxProps) {
  // Only render if we have valid coordinates
  if (box.width === 0 && box.height === 0) return null;

  return (
    <div
      className="absolute border-2 border-gideon-green pointer-events-none"
      style={{
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }}
    >
      {box.label && (
        <div className="absolute -top-5 left-0 bg-gideon-green text-gideon-black text-xs px-1 py-0.5 font-mono whitespace-nowrap">
          {box.label}
        </div>
      )}
    </div>
  );
}
