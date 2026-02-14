"use client";

import { useGideon } from "@/components/providers/GideonProvider";
import OverlayBox from "./OverlayBox";
import { DotBackground } from "@/components/ui/dot-background";

export default function LiveFeed() {
  const { latestScreenshot, boundingBoxes } = useGideon();
  const screenshotSrc = latestScreenshot?.startsWith("data:image")
    ? latestScreenshot
    : latestScreenshot
      ? `data:image/jpeg;base64,${latestScreenshot}`
      : null;

  if (!screenshotSrc) {
    return (
      <DotBackground className="bg-gideon-dark" dotColor="rgba(80,80,104,0.2)" gap={28}>
        <div className="flex items-center justify-center h-full relative z-10">
          <div className="text-center">
            {/* Animated empty state */}
            <div className="relative w-24 h-24 mx-auto mb-6">
              {/* Outer ring */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  border: "1px solid rgba(255,255,255,0.05)",
                  animation: "orbit-spin 20s linear infinite",
                }}
              />
              {/* Middle ring */}
              <div
                className="absolute rounded-full"
                style={{
                  inset: "12px",
                  border: "1px dashed rgba(255,255,255,0.04)",
                  animation: "orbit-spin 15s linear infinite reverse",
                }}
              />
              {/* Center icon */}
              <div
                className="absolute flex items-center justify-center"
                style={{ inset: "28px" }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  style={{ color: "var(--color-gideon-muted)", opacity: 0.5 }}
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              {/* Orbiting dot */}
              <div
                className="absolute"
                style={{
                  width: "3px",
                  height: "3px",
                  borderRadius: "50%",
                  background: "var(--color-gideon-cyan)",
                  top: "0",
                  left: "50%",
                  transformOrigin: "0 48px",
                  animation: "orbit-spin 10s linear infinite",
                  opacity: 0.5,
                  boxShadow: "0 0 6px var(--color-gideon-cyan)",
                }}
              />
            </div>

            <p
              className="text-xs uppercase tracking-[0.2em] mb-1.5"
              style={{
                fontFamily: "var(--font-display)",
                color: "var(--color-gideon-muted)",
                opacity: 0.7,
              }}
            >
              No Active Session
            </p>
            <p
              className="text-[10px] tracking-wide"
              style={{
                color: "var(--color-gideon-muted)",
                opacity: 0.4,
              }}
            >
              Send a command to begin browsing
            </p>
          </div>
        </div>
      </DotBackground>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={screenshotSrc}
        alt="Browser screenshot"
        className="max-w-full max-h-full object-contain"
      />

      {boundingBoxes.map((box, i) => (
        <OverlayBox key={i} box={box} />
      ))}
    </div>
  );
}
