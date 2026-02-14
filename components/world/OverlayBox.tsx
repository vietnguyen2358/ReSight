"use client";

import type { BoundingBox } from "@/components/providers/GideonProvider";

interface OverlayBoxProps {
  box: BoundingBox;
}

export default function OverlayBox({ box }: OverlayBoxProps) {
  if (box.width === 0 && box.height === 0) return null;

  const cornerSize = Math.min(12, box.width * 0.15, box.height * 0.15);
  const color = "var(--color-resite-green)";

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }}
    >
      {/* Corner brackets instead of full border */}
      {/* Top-left */}
      <div
        className="absolute top-0 left-0"
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          borderTop: `2px solid ${color}`,
          borderLeft: `2px solid ${color}`,
          filter: `drop-shadow(0 0 3px ${color})`,
        }}
      />
      {/* Top-right */}
      <div
        className="absolute top-0 right-0"
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          borderTop: `2px solid ${color}`,
          borderRight: `2px solid ${color}`,
          filter: `drop-shadow(0 0 3px ${color})`,
        }}
      />
      {/* Bottom-left */}
      <div
        className="absolute bottom-0 left-0"
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          borderBottom: `2px solid ${color}`,
          borderLeft: `2px solid ${color}`,
          filter: `drop-shadow(0 0 3px ${color})`,
        }}
      />
      {/* Bottom-right */}
      <div
        className="absolute bottom-0 right-0"
        style={{
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
          borderBottom: `2px solid ${color}`,
          borderRight: `2px solid ${color}`,
          filter: `drop-shadow(0 0 3px ${color})`,
        }}
      />

      {/* Subtle fill */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,255,106,0.03)" }}
      />

      {/* Label */}
      {box.label && (
        <div
          className="absolute -top-6 left-0 text-[10px] px-2 py-0.5 whitespace-nowrap rounded-sm"
          style={{
            fontFamily: "var(--font-display)",
            background: "rgba(0,255,106,0.15)",
            color: "var(--color-resite-green)",
            border: "1px solid rgba(0,255,106,0.25)",
            letterSpacing: "0.05em",
            backdropFilter: "blur(4px)",
          }}
        >
          {box.label}
        </div>
      )}
    </div>
  );
}
