"use client";

import { useMemo } from "react";
import { useReducedMotion } from "framer-motion";

const COLORS = [
  "#FBBF24",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#10B981",
  "#8B5CF6",
  "#FFFFFF",
] as const;

type Shape = "rect" | "circle" | "ribbon";

interface Piece {
  id: number;
  left: string;
  top: string;
  color: string;
  shape: Shape;
  width: number;
  height: number;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
}

function buildPieces(count: number): Piece[] {
  const shapes: Shape[] = ["rect", "circle", "ribbon"];
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: `${2 + Math.random() * 96}%`,
    top: `${Math.random() * 4}%`,
    color: COLORS[i % COLORS.length]!,
    shape: shapes[i % shapes.length]!,
    width: 4 + Math.random() * 5,
    height: 7 + Math.random() * 9,
    delay: Math.random() * 4.5,
    duration: 2.6 + Math.random() * 2.4,
    drift: (Math.random() - 0.5) * 40,
    spin: (Math.random() - 0.5) * 540,
  }));
}

function pieceStyle(p: Piece): React.CSSProperties {
  const base: React.CSSProperties = {
    left: p.left,
    top: p.top,
    width: p.shape === "circle" ? p.width : p.width,
    height: p.shape === "circle" ? p.width : p.height,
    background: p.color,
    animationDelay: `${p.delay}s`,
    animationDuration: `${p.duration}s`,
    ["--confetti-drift" as string]: `${p.drift}px`,
    ["--confetti-spin" as string]: `${p.spin}deg`,
  };

  if (p.shape === "circle") {
    return { ...base, borderRadius: "50%" };
  }
  if (p.shape === "ribbon") {
    return { ...base, borderRadius: "2px", width: p.width * 0.55, height: p.height * 1.35 };
  }
  return { ...base, borderRadius: "1px" };
}

/** Full-card confetti rain — top to bottom only. */
export function WinCardConfettiLoop({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const pieces = useMemo(() => buildPieces(reduce ? 10 : 22), [reduce]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden [container-type:size]"
      aria-hidden
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="play-win-confetti-piece play-win-confetti-piece--fall absolute"
          style={pieceStyle(p)}
        />
      ))}
    </div>
  );
}
