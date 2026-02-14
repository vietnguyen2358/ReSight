"use client";

import { useEffect, useRef } from "react";
import { useGideon } from "@/components/providers/GideonProvider";

const STATUS_COLORS: Record<string, string> = {
  idle: "#00ffff",
  listening: "#00ff66",
  thinking: "#ffd700",
  speaking: "#ccff00",
};

const STATUS_SPEED: Record<string, number> = {
  idle: 0.005,
  listening: 0.01,
  thinking: 0.03,
  speaking: 0.015,
};

// Icosahedron vertices and edges (subdivision level 1)
function generateIcosahedron() {
  const t = (1 + Math.sqrt(5)) / 2;
  const vertices = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  // Normalize to unit sphere
  const norm = vertices.map((v) => {
    const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
    return [v[0] / len, v[1] / len, v[2] / len];
  });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  // Subdivide once
  const midCache: Record<string, number> = {};
  const getMid = (a: number, b: number): number => {
    const key = Math.min(a, b) + ":" + Math.max(a, b);
    if (midCache[key] !== undefined) return midCache[key];
    const va = norm[a], vb = norm[b];
    const mid = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
    const len = Math.sqrt(mid[0] ** 2 + mid[1] ** 2 + mid[2] ** 2);
    norm.push([mid[0] / len, mid[1] / len, mid[2] / len]);
    midCache[key] = norm.length - 1;
    return midCache[key];
  };
  const subdividedFaces: number[][] = [];
  for (const [a, b, c] of faces) {
    const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a);
    subdividedFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  // Collect unique edges
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (const [a, b, c] of subdividedFaces) {
    for (const [x, y] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const key = Math.min(x, y) + ":" + Math.max(x, y);
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([x, y]); }
    }
  }
  return { vertices: norm, edges };
}

function project(
  v: number[], rx: number, ry: number, scale: number, cx: number, cy: number
) {
  // Rotate Y
  let x = v[0] * Math.cos(ry) + v[2] * Math.sin(ry);
  const y1 = v[1];
  let z = -v[0] * Math.sin(ry) + v[2] * Math.cos(ry);
  // Rotate X
  const y2 = y1 * Math.cos(rx) - z * Math.sin(rx);
  z = y1 * Math.sin(rx) + z * Math.cos(rx);
  // Perspective
  const perspective = 4 / (4 + z);
  return { x: cx + x * scale * perspective, y: cy + y2 * scale * perspective, z };
}

export default function GideonSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { status } = useGideon();
  const stateRef = useRef({ rx: 0, ry: 0, status: "idle" });
  stateRef.current.status = status;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { vertices, edges } = generateIcosahedron();
    let animId: number;

    const draw = () => {
      const s = stateRef.current.status;
      const speed = STATUS_SPEED[s] || STATUS_SPEED.idle;
      const color = STATUS_COLORS[s] || STATUS_COLORS.idle;

      stateRef.current.rx += speed;
      stateRef.current.ry += speed * 0.7;

      const w = canvas.width = canvas.offsetWidth * 2;
      const h = canvas.height = canvas.offsetHeight * 2;
      const cx = w / 2, cy = h / 2;
      const pulse = s === "thinking" || s === "listening"
        ? 1 + Math.sin(Date.now() * 0.005) * 0.05 : 1;
      const scale = Math.min(w, h) * 0.32 * pulse;

      ctx.clearRect(0, 0, w, h);

      // Glow effect
      ctx.shadowColor = color;
      ctx.shadowBlur = s === "thinking" ? 30 : 15;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.85;

      const projected = vertices.map((v) =>
        project(v, stateRef.current.rx, stateRef.current.ry, scale, cx, cy)
      );

      // Draw edges
      ctx.beginPath();
      for (const [a, b] of edges) {
        const pa = projected[a], pb = projected[b];
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
      ctx.stroke();

      // Draw vertices
      ctx.fillStyle = color;
      ctx.shadowBlur = 8;
      for (const p of projected) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full"
      style={{ imageRendering: "auto" }}
    />
  );
}
