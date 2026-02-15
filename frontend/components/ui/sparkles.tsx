"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  fadeSpeed: number;
  color: string;
}

interface SparklesCoreProps {
  id?: string;
  className?: string;
  background?: string;
  minSize?: number;
  maxSize?: number;
  speed?: number;
  particleColor?: string;
  particleDensity?: number;
}

export function SparklesCore({
  id = "sparkles",
  className,
  background = "transparent",
  minSize = 0.4,
  maxSize = 1.2,
  speed = 1,
  particleColor = "#00e5ff",
  particleDensity = 80,
}: SparklesCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      setDimensions({
        width: canvas.offsetWidth,
        height: canvas.offsetHeight,
      });
    };

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const particles: Particle[] = [];
    const count = Math.floor((dimensions.width * dimensions.height) / (10000 / particleDensity));

    for (let i = 0; i < Math.min(count, 200); i++) {
      particles.push({
        x: Math.random() * dimensions.width,
        y: Math.random() * dimensions.height,
        size: Math.random() * (maxSize - minSize) + minSize,
        speedX: (Math.random() - 0.5) * speed * 0.3,
        speedY: (Math.random() - 0.5) * speed * 0.3,
        opacity: Math.random(),
        fadeSpeed: (Math.random() * 0.01 + 0.003) * speed,
        color: particleColor,
      });
    }

    let animId: number;
    let fadeDir = 1;

    const animate = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        p.opacity += p.fadeSpeed * fadeDir;

        if (p.opacity >= 1) {
          p.opacity = 1;
          p.fadeSpeed = Math.abs(p.fadeSpeed);
          fadeDir = -1;
        } else if (p.opacity <= 0) {
          p.opacity = 0;
          p.fadeSpeed = Math.abs(p.fadeSpeed);
          fadeDir = 1;
          p.x = Math.random() * dimensions.width;
          p.y = Math.random() * dimensions.height;
        }

        if (p.x < 0) p.x = dimensions.width;
        if (p.x > dimensions.width) p.x = 0;
        if (p.y < 0) p.y = dimensions.height;
        if (p.y > dimensions.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity * 0.6;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity * 0.1;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animId);
  }, [dimensions, minSize, maxSize, speed, particleColor, particleDensity]);

  return (
    <canvas
      ref={canvasRef}
      id={id}
      className={cn("w-full h-full", className)}
      style={{ background }}
    />
  );
}
