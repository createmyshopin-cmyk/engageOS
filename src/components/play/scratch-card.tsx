"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ScratchCardProps {
  /** Rendered underneath the scratch layer */
  children: React.ReactNode;
  /** Fired once when enough area has been scratched */
  onReveal: () => void;
  /** Disable interaction (e.g. while the play request is in flight) */
  disabled?: boolean;
}

const REVEAL_THRESHOLD = 0.45; // fraction of pixels cleared
const BRUSH_RADIUS = 24;

/**
 * Canvas scratch layer. Pointer events only (covers touch + mouse),
 * no external deps. Coverage is sampled on pointer-up to avoid
 * per-frame getImageData cost on low-end phones.
 */
export function ScratchCard({ children, onReveal, disabled }: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scratching = useRef(false);
  const revealed = useRef(false);
  const [done, setDone] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const totalDistance = useRef(0);

  // Paint the foil layer once, sized to the container at device resolution.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const grad = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    grad.addColorStop(0, "#b45309");
    grad.addColorStop(0.5, "#f59e0b");
    grad.addColorStop(1, "#b45309");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Scratch here 👆", rect.width / 2, rect.height / 2);
  }, []);

  const checkCoverage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || revealed.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const step = 8; // sample every 8th pixel in each axis
    const data = ctx.getImageData(0, 0, width, height).data;
    let cleared = 0;
    let total = 0;
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        total++;
        if (data[(y * width + x) * 4 + 3] === 0) cleared++;
      }
    }
    if (total > 0 && cleared / total >= REVEAL_THRESHOLD) {
      revealed.current = true;
      setDone(true);
      onReveal();
    }
  }, [onReveal]);

  const scratchAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (disabled || revealed.current) return;
      scratching.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      scratchAt(e.clientX, e.clientY);
    },
    [disabled, scratchAt]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!scratching.current || disabled || revealed.current) return;
      
      const dx = e.clientX - (lastPos.current?.x ?? e.clientX);
      const dy = e.clientY - (lastPos.current?.y ?? e.clientY);
      const dist = Math.sqrt(dx * dx + dy * dy);
      totalDistance.current += dist;
      lastPos.current = { x: e.clientX, y: e.clientY };

      scratchAt(e.clientX, e.clientY);

      // Auto-reveal after dragging 120 pixels (2-3 short rubs)
      if (totalDistance.current > 120) {
        revealed.current = true;
        setDone(true);
        onReveal();
      }
    },
    [disabled, onReveal, scratchAt]
  );

  const handlePointerUp = useCallback(() => {
    if (!scratching.current) return;
    scratching.current = false;
    lastPos.current = null;
    checkCoverage();
  }, [checkCoverage]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-2xl"
      style={{ aspectRatio: "16 / 10" }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
      <canvas
        ref={canvasRef}
        role="button"
        aria-label="Scratch card — rub to reveal your result"
        className="absolute inset-0 touch-none select-none"
        style={{
          opacity: done ? 0 : 1,
          transition: "opacity 400ms ease",
          pointerEvents: done ? "none" : "auto",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
    </div>
  );
}
