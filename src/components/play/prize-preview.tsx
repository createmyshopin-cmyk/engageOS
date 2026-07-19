"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { CampaignDisplayPrize } from "@/lib/types";

const TONES = [
  { chip: "bg-emerald-500", hint: "next purchase" },
  { chip: "bg-violet-500", hint: "today" },
  { chip: "bg-orange-500", hint: "this week" },
  { chip: "bg-rose-500", hint: "instantly" },
] as const;

function prizeShortLabel(name: string): string {
  const pct = name.match(/(\d+)\s*%/);
  if (pct) return `${pct[1]}%`;
  const rupee = name.match(/₹\s*([\d,]+)/);
  if (rupee) return `₹${rupee[1]}`;
  return name.slice(0, 4).toUpperCase();
}

function prizeLine(name: string, hint: string): string {
  const pct = name.match(/(\d+)\s*%\s*OFF/i);
  if (pct) return `${pct[1]}% OFF ${hint}`;
  return name;
}

interface PrizePreviewProps {
  prizes: CampaignDisplayPrize[];
}

export function PrizePreview({ prizes }: PrizePreviewProps) {
  const reduce = useReducedMotion();
  if (prizes.length === 0) return null;

  const shown = prizes.slice(0, 2);

  return (
    <div className="mb-5 grid grid-cols-2 gap-2.5">
      {shown.map((prize, i) => {
        const tone = TONES[i % TONES.length]!;
        return (
          <motion.div
            key={`${prize.name}-${i}`}
            className="play-shimmer relative flex items-center gap-2.5 overflow-hidden rounded-2xl bg-white px-3 py-3.5 shadow-md ring-1 ring-black/5"
            initial={reduce ? false : { y: 16, opacity: 0 }}
            animate={
              reduce
                ? { y: 0, opacity: 1 }
                : { y: [0, -3, 0], opacity: 1 }
            }
            transition={
              reduce
                ? { type: "spring", duration: 0.45, bounce: 0.3, delay: 0.85 + i * 0.08 }
                : {
                    y: {
                      duration: 2.8 + i * 0.3,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: 1 + i * 0.2,
                    },
                    opacity: { duration: 0.45, delay: 0.85 + i * 0.08 },
                  }
            }
            whileHover={reduce ? undefined : { scale: 1.03 }}
          >
            <motion.div
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold text-white shadow-sm ${tone.chip}`}
              aria-hidden
              animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
              transition={{
                duration: 2.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.35,
              }}
            >
              {prizeShortLabel(prize.name)}
            </motion.div>
            <div className="min-w-0 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                Win
              </p>
              <p className="truncate text-xs font-semibold leading-snug text-neutral-800">
                {prizeLine(prize.name, tone.hint)}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
