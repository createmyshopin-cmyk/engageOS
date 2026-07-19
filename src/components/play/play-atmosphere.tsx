"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Soft mandalas + floating festival particles behind the play page.
 * Transform/opacity only — loops forever, never heavy.
 */
export function PlayAtmosphere() {
  const reduce = useReducedMotion();

  const bits = useMemo(
    () =>
      [
        { left: "8%", top: "12%", emoji: "✦", size: 11, dur: 3.2, delay: 0 },
        { left: "86%", top: "10%", emoji: "✧", size: 10, dur: 3.8, delay: 0.4 },
        { left: "14%", top: "38%", emoji: "🌸", size: 14, dur: 4.4, delay: 0.8 },
        { left: "78%", top: "34%", emoji: "🍃", size: 13, dur: 4.1, delay: 1.1 },
        { left: "22%", top: "62%", emoji: "✦", size: 9, dur: 3.5, delay: 0.2 },
        { left: "88%", top: "58%", emoji: "🌸", size: 12, dur: 4.6, delay: 1.4 },
        { left: "6%", top: "78%", emoji: "✧", size: 10, dur: 3.9, delay: 0.6 },
        { left: "70%", top: "82%", emoji: "✦", size: 9, dur: 3.3, delay: 1.0 },
      ] as const,
    []
  );

  const confetti = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        left: `${10 + ((i * 11) % 80)}%`,
        top: `${8 + ((i * 13) % 75)}%`,
        color: i % 2 === 0 ? "#F97316" : "#FBBF24",
        dur: 3.4 + (i % 4) * 0.4,
        delay: i * 0.25,
        rot: i * 18,
      })),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="play-mandala play-mandala--tl" />
      <div className="play-mandala play-mandala--br" />

      {!reduce &&
        bits.map((b, i) => (
          <motion.span
            key={`bit-${i}`}
            className="absolute"
            style={{ left: b.left, top: b.top, fontSize: b.size }}
            animate={{
              y: [0, -10, 0],
              opacity: [0.35, 0.9, 0.35],
              rotate: [0, i % 2 === 0 ? 10 : -10, 0],
              scale: [0.92, 1.08, 0.92],
            }}
            transition={{
              duration: b.dur,
              delay: b.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {b.emoji}
          </motion.span>
        ))}

      {!reduce &&
        confetti.map((c) => (
          <motion.span
            key={`c-${c.id}`}
            className="absolute rounded-[1px]"
            style={{
              left: c.left,
              top: c.top,
              width: 5,
              height: 8,
              background: c.color,
            }}
            animate={{
              y: [0, 14, 0],
              x: [0, c.id % 2 === 0 ? 6 : -6, 0],
              rotate: [c.rot, c.rot + 40, c.rot],
              opacity: [0.4, 0.85, 0.4],
            }}
            transition={{
              duration: c.dur,
              delay: c.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
    </div>
  );
}
