"use client";

import { cn } from "./cn";

export function DotBackground({
  children,
  className,
  dotColor = "rgba(80, 80, 104, 0.3)",
  dotSize = 1,
  gap = 24,
}: {
  children?: React.ReactNode;
  className?: string;
  dotColor?: string;
  dotSize?: number;
  gap?: number;
}) {
  return (
    <div
      className={cn("relative w-full h-full", className)}
      style={{
        backgroundImage: `radial-gradient(${dotColor} ${dotSize}px, transparent ${dotSize}px)`,
        backgroundSize: `${gap}px ${gap}px`,
      }}
    >
      {/* Radial fade mask */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, var(--color-resite-dark) 80%)",
        }}
      />
      {children}
    </div>
  );
}

export function GridBackground({
  children,
  className,
  lineColor = "rgba(80, 80, 104, 0.08)",
  gap = 40,
}: {
  children?: React.ReactNode;
  className?: string;
  lineColor?: string;
  gap?: number;
}) {
  return (
    <div
      className={cn("relative w-full h-full", className)}
      style={{
        backgroundImage: `
          linear-gradient(${lineColor} 1px, transparent 1px),
          linear-gradient(90deg, ${lineColor} 1px, transparent 1px)
        `,
        backgroundSize: `${gap}px ${gap}px`,
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 20%, var(--color-resite-dark) 75%)",
        }}
      />
      {children}
    </div>
  );
}
