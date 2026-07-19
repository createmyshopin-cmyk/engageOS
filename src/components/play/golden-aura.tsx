"use client";

import { useMemo } from "react";

const GOLD = ["#FBBF24", "#F59E0B", "#FCD34D", "#EAB308", "#FEF3C7"] as const;

interface Speck {
  id: number;
  left: string;
  top: string;
  size: number;
  color: string;
  delay: number;
  duration: number;
  driftX: number;
}

function buildSpecks(count: number): Speck[] {
  return Array.from({ length: count }, (_, i) => {
    // Bias toward the rim around the card
    const edge = i % 4;
    let left = Math.random() * 100;
    let top = Math.random() * 100;
    if (edge === 0) top = Math.random() * 18;
    if (edge === 1) top = 82 + Math.random() * 18;
    if (edge === 2) left = Math.random() * 18;
    if (edge === 3) left = 82 + Math.random() * 18;

    return {
      id: i,
      left: `${left}%`,
      top: `${top}%`,
      size: 2 + Math.random() * 3.5,
      color: GOLD[i % GOLD.length]!,
      delay: Math.random() * 4,
      duration: 3.5 + Math.random() * 3.5,
      driftX: (Math.random() - 0.5) * 18,
    };
  });
}

/**
 * Soft golden dust that continuously floats around the scratch / win card.
 * Transform/opacity only — stays light on mobile.
 */
export function GoldenAura({ children }: { children: React.ReactNode }) {
  const specks = useMemo(() => buildSpecks(18), []);

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-5 z-[1] overflow-visible"
        aria-hidden
      >
        {specks.map((s) => (
          <span
            key={s.id}
            className="play-gold-float absolute rounded-full"
            style={
              {
                left: s.left,
                top: s.top,
                width: s.size,
                height: s.size,
                background: s.color,
                boxShadow: `0 0 ${s.size * 2.2}px ${s.color}`,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.duration}s`,
                "--gold-drift": `${s.driftX}px`,
              } as React.CSSProperties
            }
          />
        ))}
        {/* Soft sparkles */}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={`spark-${i}`}
            className="play-gold-sparkle absolute text-[9px] leading-none text-amber-300"
            style={{
              left: `${8 + (i * 17) % 84}%`,
              top: `${6 + (i * 23) % 88}%`,
              animationDelay: `${i * 0.7}s`,
              animationDuration: `${3.2 + (i % 3) * 0.6}s`,
            }}
          >
            ✦
          </span>
        ))}
      </div>
      <div className="relative z-[2]">{children}</div>
    </div>
  );
}
