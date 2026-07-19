"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScratchAudio } from "@/components/play/scratch-audio";

interface ScratchCardProps {
  children: React.ReactNode;
  onReveal: () => void;
  disabled?: boolean;
  /** Foil scratch SFX — defaults on */
  soundEnabled?: boolean;
}

const REVEAL_THRESHOLD = 0.7;
const BRUSH = 40; // 35–45px soft circular brush
const SAMPLE_STEP = 10;

interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

function haptic(ms: number | number[] = 40) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(ms);
    }
  } catch {
    /* ignore */
  }
}

function paintGoldFoil(ctx: CanvasRenderingContext2D, w: number, h: number) {
  // Metallic orange-gold foil (Onam / GPay reward feel)
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, "#E85D04");
  base.addColorStop(0.28, "#F48C06");
  base.addColorStop(0.52, "#FFBA08");
  base.addColorStop(0.75, "#F48C06");
  base.addColorStop(1, "#DC2F02");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Soft reflection band
  const sheen = ctx.createLinearGradient(0, 0, w * 0.9, h);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.35, "rgba(255,255,255,0.28)");
  sheen.addColorStop(0.5, "rgba(255,248,220,0.12)");
  sheen.addColorStop(0.65, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);

  // Vertical highlight
  const gloss = ctx.createLinearGradient(0, 0, 0, h);
  gloss.addColorStop(0, "rgba(255,255,255,0.18)");
  gloss.addColorStop(0.45, "rgba(255,255,255,0)");
  gloss.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, w, h);

  // Noise / grain
  const grain = ctx.createImageData(Math.min(Math.ceil(w), 320), Math.min(Math.ceil(h), 420));
  const d = grain.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() * 50) | 0;
    d[i] = d[i + 1] = d[i + 2] = n;
    d[i + 3] = 22;
  }
  const tmp = document.createElement("canvas");
  tmp.width = grain.width;
  tmp.height = grain.height;
  tmp.getContext("2d")!.putImageData(grain, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.drawImage(tmp, 0, 0, w, h);
  ctx.restore();

  // Tiny glitter
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 0.6 + Math.random() * 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle =
      Math.random() > 0.5 ? "rgba(255,255,240,0.75)" : "rgba(255,215,80,0.55)";
    ctx.fill();
  }

  // Inner shadow
  const inset = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.35,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.72
  );
  inset.addColorStop(0, "rgba(0,0,0,0)");
  inset.addColorStop(1, "rgba(60,40,0,0.28)");
  ctx.fillStyle = inset;
  ctx.fillRect(0, 0, w, h);

  // Dashed frame
  ctx.save();
  ctx.strokeStyle = "rgba(255,248,220,0.55)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.restore();

  // Center gift only — "Scratch Here" pulse is an HTML overlay
  const cx = w / 2;
  const cy = h * 0.44;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "rgba(80,50,0,0.2)";
  ctx.font = "600 36px system-ui, sans-serif";
  ctx.fillText("🎁", cx + 1, cy + 2);

  ctx.fillStyle = "#FFF8E7";
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.fillText("🎁", cx, cy);
}

/**
 * Premium gold-foil scratch card — soft anti-aliased brush, foil SFX,
 * gold dust, auto-reveal at ~68%, mobile-first pointer events.
 */
export function ScratchCard({
  children,
  onReveal,
  disabled,
  soundEnabled = true,
}: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scratching = useRef(false);
  const revealed = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const totalDistance = useRef(0);
  const moveTicks = useRef(0);
  const dust = useRef<Dust[]>([]);
  const dustRaf = useRef(0);
  const audioRef = useRef<ScratchAudio | null>(null);
  const cssW = useRef(0);
  const cssH = useRef(0);
  const dprRef = useRef(1);

  const [done, setDone] = useState(false);
  const [active, setActive] = useState(false);
  const [entered, setEntered] = useState(false);
  const [showCue, setShowCue] = useState(true);
  const [shine, setShine] = useState(false);

  useEffect(() => {
    audioRef.current = new ScratchAudio();
    // Card fade-in → shine sweep → pulse cue
    const tEnter = window.setTimeout(() => setEntered(true), 40);
    const tShine = window.setTimeout(() => setShine(true), 420);
    return () => {
      audioRef.current?.dispose();
      cancelAnimationFrame(dustRaf.current);
      window.clearTimeout(tEnter);
      window.clearTimeout(tShine);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dustC = dustRef.current;
    const container = containerRef.current;
    if (!canvas || !dustC || !container) return;

    const paint = () => {
      if (revealed.current) return;
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      cssW.current = rect.width;
      cssH.current = rect.height;

      for (const c of [canvas, dustC]) {
        c.width = Math.round(rect.width * dpr);
        c.height = Math.round(rect.height * dpr);
        c.style.width = `${rect.width}px`;
        c.style.height = `${rect.height}px`;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintGoldFoil(ctx, rect.width, rect.height);

      const dctx = dustC.getContext("2d");
      dctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    paint();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(paint) : null;
    ro?.observe(container);
    return () => ro?.disconnect();
  }, []);

  const spawnDust = useCallback((x: number, y: number, n = 5) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.4 + Math.random() * 2.2;
      dust.current.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 0.6,
        life: 0,
        max: 0.35 + Math.random() * 0.45,
        size: 1 + Math.random() * 2.2,
        color:
          Math.random() > 0.4
            ? "rgba(255, 215, 90, 0.9)"
            : "rgba(255, 248, 220, 0.85)",
      });
    }
    if (dust.current.length > 120) {
      dust.current.splice(0, dust.current.length - 120);
    }
  }, []);

  const tickDust = useCallback(() => {
    const c = dustRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = cssW.current;
    const h = cssH.current;
    ctx.clearRect(0, 0, w, h);

    const next: Dust[] = [];
    for (const p of dust.current) {
      p.life += 0.016;
      if (p.life >= p.max) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04;
      p.vx *= 0.98;
      const t = p.life / p.max;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fill();
      next.push(p);
    }
    dust.current = next;
    ctx.globalAlpha = 1;

    if (next.length > 0 && !revealed.current) {
      dustRaf.current = requestAnimationFrame(tickDust);
    }
  }, []);

  const ensureDustLoop = useCallback(() => {
    cancelAnimationFrame(dustRaf.current);
    dustRaf.current = requestAnimationFrame(tickDust);
  }, [tickDust]);

  const softErase = useCallback(
    (lx: number, ly: number, from: { x: number; y: number } | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const stamp = (x: number, y: number) => {
        const g = ctx.createRadialGradient(x, y, BRUSH * 0.28, x, y, BRUSH);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(0.45, "rgba(0,0,0,0.92)");
        g.addColorStop(0.78, "rgba(0,0,0,0.35)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, BRUSH, 0, Math.PI * 2);
        ctx.fill();
        spawnDust(x, y, 3);
      };

      if (!from) {
        stamp(lx, ly);
        ensureDustLoop();
        return;
      }

      const dx = lx - from.x;
      const dy = ly - from.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / 5));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        stamp(from.x + dx * t, from.y + dy * t);
      }
      ensureDustLoop();
    },
    [ensureDustLoop, spawnDust]
  );

  const finishReveal = useCallback(() => {
    if (revealed.current) return;
    revealed.current = true;
    scratching.current = false;
    setActive(false);
    setShowCue(false);
    audioRef.current?.stop();
    haptic([40, 30, 50]);

    // Win card shows its own confetti loop — skip foil gold dust
    dust.current = [];
    cancelAnimationFrame(dustRaf.current);

    setDone(true);
    // Confetti / coupon sequence kicks off after foil explosion starts
    window.setTimeout(() => onReveal(), 80);
  }, [onReveal]);

  const checkCoverage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || revealed.current) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let cleared = 0;
    let total = 0;
    for (let y = 0; y < height; y += SAMPLE_STEP) {
      for (let x = 0; x < width; x += SAMPLE_STEP) {
        total++;
        if (data[(y * width + x) * 4 + 3] < 48) cleared++;
      }
    }
    if (total > 0 && cleared / total >= REVEAL_THRESHOLD) {
      finishReveal();
    }
  }, [finishReveal]);

  const toLocal = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || revealed.current) return;
      e.preventDefault();
      scratching.current = true;
      setActive(true);
      setShowCue(false);
      const local = toLocal(e.clientX, e.clientY);
      lastPos.current = local;
      e.currentTarget.setPointerCapture(e.pointerId);
      haptic(40);
      if (soundEnabled) audioRef.current?.start();
      softErase(local.x, local.y, null);
    },
    [disabled, softErase, soundEnabled]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!scratching.current || disabled || revealed.current) return;
      e.preventDefault();

      const local = toLocal(e.clientX, e.clientY);
      const prev = lastPos.current;
      const dist = prev ? Math.hypot(local.x - prev.x, local.y - prev.y) : 0;
      totalDistance.current += dist;

      softErase(local.x, local.y, prev);
      lastPos.current = local;

      moveTicks.current += 1;
      if (moveTicks.current % 4 === 0 && soundEnabled) {
        audioRef.current?.keepAlive();
      }
      // Sample coverage periodically while dragging
      if (moveTicks.current % 8 === 0) {
        checkCoverage();
      }

      if (totalDistance.current > 220) {
        checkCoverage();
      }
    },
    [checkCoverage, disabled, softErase, soundEnabled]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!scratching.current) return;
      e.preventDefault();
      scratching.current = false;
      setActive(false);
      lastPos.current = null;
      audioRef.current?.stop();
      checkCoverage();
    },
    [checkCoverage]
  );

  const keyboardReveal = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (disabled || revealed.current) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        finishReveal();
      }
    },
    [disabled, finishReveal]
  );

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-[1.35rem] transition-[opacity,transform,box-shadow] duration-[400ms] ease-out ${
        entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      } ${
        active
          ? "scale-[1.01] shadow-[0_20px_50px_-18px_rgba(212,160,23,0.65)] ring-1 ring-amber-300/40"
          : "shadow-lg shadow-amber-700/20"
      } ${done ? "scale-[1.03]" : ""}`}
      style={{ aspectRatio: "4 / 5" }}
    >
      <div
        className={`absolute inset-0 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          done ? "scale-100" : "scale-[0.992]"
        }`}
      >
        {children}
      </div>

      <canvas
        ref={canvasRef}
        role="button"
        tabIndex={0}
        aria-label="Scratch card — rub or press Enter to reveal your reward"
        className={`absolute inset-0 touch-none select-none outline-none transition-[opacity,transform,filter] duration-[720ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
          done
            ? "pointer-events-none scale-[1.04] opacity-0 blur-md"
            : "opacity-100"
        }`}
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={keyboardReveal}
      />

      {/* Gold foil shine sweep (after fade-in) */}
      {!done && shine && (
        <div className="play-foil-shine pointer-events-none absolute inset-0" aria-hidden />
      )}

      {/* Scratch Here pulse cue */}
      {showCue && !done && (
        <div
          className="pointer-events-none absolute inset-0 z-[2] flex flex-col items-center justify-center"
          aria-hidden
        >
          <p className="play-scratch-cue text-[1.4rem] font-extrabold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(120,40,0,0.45)]">
            Scratch Here 👆
          </p>
          <p className="mt-1.5 text-[11px] font-medium text-white/90">
            ◆ Reveal your special offer ◆
          </p>
        </div>
      )}

      <canvas
        ref={dustRef}
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-[3] transition-opacity duration-300 ${
          done ? "opacity-0" : "opacity-100"
        }`}
      />
    </div>
  );
}
