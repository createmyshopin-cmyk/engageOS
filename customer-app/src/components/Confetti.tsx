import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const COLORS = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#f87171", "#a78bfa"];
const COUNT = 90;
const DURATION_MS = 2600;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vr: number;
}

/** Tiny canvas confetti burst — zero dependencies, auto-cleans after ~2.6s. */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const w = window.innerWidth;
    const h = window.innerHeight;

    const particles: Particle[] = Array.from({ length: COUNT }, (_, i) => ({
      x: w / 2 + (Math.random() - 0.5) * 80,
      y: h * 0.4,
      vx: (Math.random() - 0.5) * 9,
      vy: -6 - Math.random() * 7,
      size: 5 + Math.random() * 5,
      color: COLORS[i % COLORS.length],
      rotation: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
    }));

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = now - start;
      if (!ctx) return;
      
      // Clear entire physical width & height safely
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();

      if (t > DURATION_MS) return;
      for (const p of particles) {
        p.vy += 0.25;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = Math.max(0, 1 - t / DURATION_MS);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return createPortal(
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999] h-full w-full"
      aria-hidden
    />,
    document.body
  );
}
