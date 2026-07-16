import { useCallback, useEffect, useRef } from "react";
import { haptic } from "../utils";

interface ScratchCardProps {
  /** Fired once when enough of the surface is scratched away. */
  onReveal: () => void;
  /** 0..1 fraction that must be scratched. */
  threshold?: number;
  /** Low Internet Mode — cap DPR at 1 to reduce memory/CPU. */
  lowPower?: boolean;
  /** Merchant setting: haptic feedback while scratching (default off). */
  haptics?: boolean;
  children: React.ReactNode;
}

const BRUSH_RADIUS = 26;
const SAMPLE_STEP = 8; // sample every Nth pixel when measuring progress

/**
 * GPU-friendly canvas scratch layer. The prize sits underneath in normal DOM;
 * the canvas paints an opaque foil and erases with destination-out strokes.
 */
export function ScratchCard({ onReveal, threshold = 0.55, lowPower, haptics, children }: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const revealed = useRef(false);
  const scratching = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const checkQueued = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d", { willReadFrequently: false });
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Foil surface
    const g = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    g.addColorStop(0, "#3f3f46");
    g.addColorStop(0.5, "#71717a");
    g.addColorStop(1, "#3f3f46");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Scratch here", rect.width / 2, rect.height / 2 + 5);

    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = BRUSH_RADIUS * 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const measure = useCallback(() => {
    checkQueued.current = false;
    const canvas = canvasRef.current;
    if (!canvas || revealed.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * SAMPLE_STEP) {
      total += 1;
      if (data[i] === 0) clear += 1;
    }
    if (total > 0 && clear / total >= threshold) {
      revealed.current = true;
      if (haptics) haptic([15, 30, 15]);
      onReveal();
    }
  }, [onReveal, threshold, haptics]);

  const scratchTo = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const from = lastPoint.current ?? { x, y };
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    lastPoint.current = { x, y };
  }, []);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    scratching.current = true;
    lastPoint.current = null;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointFromEvent(e);
    scratchTo(p.x, p.y);
    if (haptics) haptic(5);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!scratching.current || revealed.current) return;
    // coalesced events for smooth 60fps strokes on fast swipes
    const events =
      "getCoalescedEvents" in e.nativeEvent
        ? e.nativeEvent.getCoalescedEvents()
        : [e.nativeEvent];
    const rect = e.currentTarget.getBoundingClientRect();
    for (const ev of events) {
      scratchTo(ev.clientX - rect.left, ev.clientY - rect.top);
    }
    if (!checkQueued.current) {
      checkQueued.current = true;
      requestAnimationFrame(measure);
    }
  };

  const handleUp = () => {
    scratching.current = false;
    lastPoint.current = null;
  };

  return (
    <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-3xl">
      <div className="absolute inset-0">{children}</div>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ opacity: 1, transition: "opacity 0.4s ease" }}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        aria-label="Scratch card — rub to reveal your prize"
        role="img"
      />
    </div>
  );
}
