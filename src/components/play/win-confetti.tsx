"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type Shape = "rect" | "circle" | "ribbon" | "diamond";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  shape: Shape;
  life: number;
  maxLife: number;
  wobble: number;
  wobbleSpeed: number;
  gravity: number;
  drag: number;
}

const COLORS = [
  "#F97316", // orange
  "#FBBF24", // amber
  "#F59E0B", // gold
  "#EF4444", // red
  "#EC4899", // pink
  "#10B981", // emerald
  "#34D399", // soft green
  "#8B5CF6", // violet
  "#FFFFFF", // white highlight
];

const SHAPES: Shape[] = ["rect", "circle", "ribbon", "diamond"];

function spawnBurst(w: number, h: number, cx: number, cy: number, count: number): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 6 + Math.random() * 14;
    return {
      x: cx + (Math.random() - 0.5) * 24,
      y: cy + (Math.random() - 0.5) * 16,
      vx: Math.cos(angle) * speed * (0.55 + Math.random() * 0.7),
      vy: Math.sin(angle) * speed * 0.55 - (8 + Math.random() * 10),
      size: 5 + Math.random() * 9,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.35,
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)]!,
      life: 0,
      maxLife: 2.4 + Math.random() * 1.6,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.08 + Math.random() * 0.12,
      gravity: 0.18 + Math.random() * 0.12,
      drag: 0.985 + Math.random() * 0.01,
    };
  });
}

function spawnFountain(w: number, h: number, count: number): Particle[] {
  return Array.from({ length: count }, () => {
    const side = Math.random() < 0.5 ? 0.18 : 0.82;
    return {
      x: w * side + (Math.random() - 0.5) * 40,
      y: h * 0.55 + (Math.random() - 0.5) * 40,
      vx: (0.5 - side) * (10 + Math.random() * 14) + (Math.random() - 0.5) * 4,
      vy: -(12 + Math.random() * 16),
      size: 4 + Math.random() * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.4,
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)]!,
      life: 0,
      maxLife: 2.2 + Math.random() * 1.4,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.1 + Math.random() * 0.14,
      gravity: 0.2 + Math.random() * 0.1,
      drag: 0.986 + Math.random() * 0.008,
    };
  });
}

/** Tiny slow-drifting pieces that linger after the main burst. */
function spawnFloaters(w: number, h: number, count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: h * (0.15 + Math.random() * 0.55),
    vx: (Math.random() - 0.5) * 1.2,
    vy: -0.15 - Math.random() * 0.55,
    size: 2 + Math.random() * 3.5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.08,
    shape: Math.random() < 0.55 ? "circle" : "diamond",
    life: 0,
    maxLife: 2.2 + Math.random() * 1.2,
    wobble: Math.random() * Math.PI * 2,
    wobbleSpeed: 0.04 + Math.random() * 0.06,
    gravity: 0.012 + Math.random() * 0.02,
    drag: 0.994,
  }));
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, alpha: number) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;

  const s = p.size;
  switch (p.shape) {
    case "circle":
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "ribbon":
      ctx.fillRect(-s * 0.15, -s * 0.7, s * 0.3, s * 1.4);
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.6);
      ctx.lineTo(s * 0.45, 0);
      ctx.lineTo(0, s * 0.6);
      ctx.lineTo(-s * 0.45, 0);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      ctx.fillRect(-s / 2, -s / 2, s, s * 0.65);
  }
  ctx.restore();
}

interface WinConfettiProps {
  active: boolean;
  onDone: () => void;
}

/**
 * Full-screen celebratory confetti for prize reveals.
 * Multi-shape, dual-burst + side fountain, flutter physics, soft fade.
 */
export function WinConfetti({ active, onDone }: WinConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      const t = window.setTimeout(onDone, 400);
      return () => window.clearTimeout(t);
    }

    let cancelled = false;
    let animId = 0;
    let wave2 = 0;
    let last = performance.now();
    let removeResize: (() => void) | undefined;

    const start = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(start);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onDone();
        return;
      }

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { w, h };
      };

      let { w, h } = resize();
      const onResize = () => {
        ({ w, h } = resize());
      };
      window.addEventListener("resize", onResize);
      removeResize = () => window.removeEventListener("resize", onResize);

      let particles: Particle[] = [
        ...spawnBurst(w, h, w / 2, h * 0.42, 90),
        ...spawnFountain(w, h, 70),
      ];

      wave2 = window.setTimeout(() => {
        if (cancelled) return;
        particles = particles.concat(
          spawnBurst(w, h, w / 2, h * 0.38, 50),
          spawnFountain(w, h, 40)
        );
      }, 220);

      let flash = 1;
      let elapsed = 0;
      let floaterAcc = 0;
      // Soft float trail after the main burst (~1s in → ~2.6s of floaters)
      const FLOAT_START = 1.0;
      const FLOAT_END = 3.5;
      const FLOAT_RATE = 18; // particles per second while trailing

      const loop = (now: number) => {
        if (cancelled) return;
        const dt = Math.min((now - last) / 1000, 0.033);
        last = now;
        elapsed += dt;

        ctx.clearRect(0, 0, w, h);

        if (flash > 0.01) {
          const g = ctx.createRadialGradient(
            w / 2,
            h * 0.4,
            0,
            w / 2,
            h * 0.4,
            Math.max(w, h) * 0.55
          );
          g.addColorStop(0, `rgba(251, 146, 60, ${0.22 * flash})`);
          g.addColorStop(0.45, `rgba(251, 191, 36, ${0.08 * flash})`);
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
          flash *= 0.92;
        }

        if (elapsed >= FLOAT_START && elapsed <= FLOAT_END) {
          floaterAcc += FLOAT_RATE * dt;
          const n = Math.floor(floaterAcc);
          if (n > 0) {
            floaterAcc -= n;
            particles = particles.concat(spawnFloaters(w, h, n));
          }
        }

        let alive = 0;
        for (const p of particles) {
          p.life += dt;
          if (p.life >= p.maxLife) continue;
          alive++;

          p.wobble += p.wobbleSpeed;
          p.vx = p.vx * p.drag + Math.sin(p.wobble) * (p.size < 4.5 ? 0.12 : 0.35);
          p.vy = p.vy * p.drag + p.gravity;
          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.spin + Math.sin(p.wobble) * 0.04;

          const t = p.life / p.maxLife;
          const alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
          drawParticle(ctx, p, Math.max(0, alpha));
        }

        // Keep going while trail is active or particles remain
        if (alive > 0 || flash > 0.02 || elapsed < FLOAT_END + 0.4) {
          animId = requestAnimationFrame(loop);
        } else {
          onDone();
        }
      };

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(start);

    return () => {
      cancelled = true;
      window.clearTimeout(wave2);
      cancelAnimationFrame(animId);
      removeResize?.();
    };
  }, [active, onDone]);

  if (!active) return null;

  return createPortal(
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999]"
      aria-hidden
    />,
    document.body
  );
}
