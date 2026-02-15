"use client";

import { useEffect, useRef } from "react";
import { useGideon } from "@/components/providers/GideonProvider";

const STATUS_COLORS: Record<string, string> = {
  idle: "#00e5ff",
  listening: "#00ff6a",
  thinking: "#ffbe0b",
  speaking: "#d4ff00",
};

const STATUS_SPEED: Record<string, number> = {
  idle: 0.004,
  listening: 0.008,
  thinking: 0.025,
  speaking: 0.012,
};

function generateIcosahedron() {
  const t = (1 + Math.sqrt(5)) / 2;
  const vertices = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
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
  let x = v[0] * Math.cos(ry) + v[2] * Math.sin(ry);
  const y1 = v[1];
  let z = -v[0] * Math.sin(ry) + v[2] * Math.cos(ry);
  const y2 = y1 * Math.cos(rx) - z * Math.sin(rx);
  z = y1 * Math.sin(rx) + z * Math.cos(rx);
  const perspective = 4 / (4 + z);
  return { x: cx + x * scale * perspective, y: cy + y2 * scale * perspective, z };
}

export default function GideonSphere() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { status } = useGideon();
  const stateRef = useRef({ rx: 0, ry: 0, status: "idle", targetColor: "#00e5ff", currentColor: "#00e5ff" });
  stateRef.current.status = status;
  stateRef.current.targetColor = STATUS_COLORS[status] || STATUS_COLORS.idle;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { vertices, edges } = generateIcosahedron();
    let animId: number;

    // Particles orbiting the sphere
    const particles = Array.from({ length: 6 }, (_, i) => ({
      angle: (i / 6) * Math.PI * 2,
      speed: 0.008 + Math.random() * 0.006,
      radius: 1.15 + Math.random() * 0.15,
      size: 1 + Math.random() * 1,
      phase: Math.random() * Math.PI * 2,
    }));

    const draw = () => {
      const s = stateRef.current.status;
      const speed = STATUS_SPEED[s] || STATUS_SPEED.idle;
      const color = STATUS_COLORS[s] || STATUS_COLORS.idle;

      stateRef.current.rx += speed;
      stateRef.current.ry += speed * 0.7;

      const dpr = 2;
      const w = canvas.width = canvas.offsetWidth * dpr;
      const h = canvas.height = canvas.offsetHeight * dpr;
      const cx = w / 2, cy = h / 2;

      const pulse = s === "thinking" || s === "listening"
        ? 1 + Math.sin(Date.now() * 0.004) * 0.06 : 1;
      const scale = Math.min(w, h) * 0.3 * pulse;

      ctx.clearRect(0, 0, w, h);

      // Ambient glow behind sphere
      const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 1.5);
      glowGrad.addColorStop(0, color + "18");
      glowGrad.addColorStop(0.5, color + "08");
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);

      // Draw edges
      ctx.shadowColor = color;
      ctx.shadowBlur = s === "thinking" ? 20 : 10;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.7;

      const projected = vertices.map((v) =>
        project(v, stateRef.current.rx, stateRef.current.ry, scale, cx, cy)
      );

      ctx.beginPath();
      for (const [a, b] of edges) {
        const pa = projected[a], pb = projected[b];
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
      }
      ctx.stroke();

      // Vertices with depth-based opacity
      ctx.shadowBlur = 6;
      for (const p of projected) {
        const depthAlpha = 0.4 + (p.z + 1) * 0.3;
        ctx.globalAlpha = Math.min(1, depthAlpha);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Orbiting particles
      ctx.shadowBlur = 4;
      ctx.globalAlpha = 0.6;
      const now = Date.now() * 0.001;
      for (const p of particles) {
        p.angle += p.speed;
        const px = cx + Math.cos(p.angle) * scale * p.radius;
        const py = cy + Math.sin(p.angle + Math.sin(now + p.phase) * 0.3) * scale * p.radius * 0.4;
        const particleAlpha = 0.3 + Math.sin(now * 2 + p.phase) * 0.2;
        ctx.globalAlpha = particleAlpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

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
