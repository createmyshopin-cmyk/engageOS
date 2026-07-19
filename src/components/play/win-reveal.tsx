"use client";

import { useCallback, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { Check, Copy, Gift } from "lucide-react";
import { WinCardConfettiLoop } from "@/components/play/win-card-confetti-loop";

const spring = { type: "spring" as const, duration: 0.45, bounce: 0.32 };
const softSpring = { type: "spring" as const, duration: 0.55, bounce: 0.28 };

interface WinRevealCardProps {
  prizeName: string;
  couponCode: string | null;
  prizeImageUrl: string | null;
  backgroundColor: string | null;
  revealed: boolean;
  instruction?: string;
}

export function WinRevealCard({
  prizeName,
  couponCode,
  prizeImageUrl,
  backgroundColor,
  revealed,
  instruction = "Use this code on your next purchase",
}: WinRevealCardProps) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = useState(false);

  const copyCode = useCallback(async () => {
    if (!couponCode) return;
    try {
      await navigator.clipboard.writeText(couponCode);
      setCopied(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(12);
      }
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore clipboard errors on insecure contexts */
    }
  }, [couponCode]);

  const bg =
    backgroundColor ??
    "linear-gradient(160deg, #059669 0%, #047857 48%, #065f46 100%)";

  return (
    <motion.div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden p-6 text-center text-white"
      style={{
        background: backgroundColor
          ? `linear-gradient(160deg, ${backgroundColor}, color-mix(in srgb, ${backgroundColor} 72%, #064e3b))`
          : bg,
        boxShadow:
          "0 18px 40px -18px rgba(4, 120, 87, 0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
      }}
      initial={reduce ? false : { scale: 0.94, opacity: 0.85 }}
      animate={
        revealed
          ? { scale: 1, opacity: 1 }
          : { scale: 0.98, opacity: 1 }
      }
      transition={spring}
    >
      {/* Confetti behind decorative background */}
      <WinCardConfettiLoop active={revealed} />

      {/* Soft radial bloom + rays */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 18%, rgba(255,255,255,0.32), transparent 62%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] opacity-40"
        style={{
          background: `
            repeating-conic-gradient(from 0deg at 50% 20%,
              rgba(255,255,255,0.16) 0deg 6deg,
              transparent 6deg 18deg)
          `,
          maskImage: "radial-gradient(circle at 50% 20%, black 0%, transparent 58%)",
          WebkitMaskImage:
            "radial-gradient(circle at 50% 20%, black 0%, transparent 58%)",
        }}
      />

      <div className="relative z-[2] flex w-full flex-col items-center">
      <motion.p
        className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-white/95"
        initial={reduce ? false : { y: 10, opacity: 0 }}
        animate={revealed ? { y: 0, opacity: 1 } : { y: 0, opacity: 0.9 }}
        transition={{ ...softSpring, delay: revealed ? 0.05 : 0 }}
      >
        🎉 You won!
      </motion.p>

      {prizeImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={prizeImageUrl}
          alt=""
          className="relative mt-3 h-14 w-14 rounded-2xl bg-white/15 object-cover ring-2 ring-white/25"
        />
      )}

      <motion.p
        className="relative mt-2 text-[1.65rem] font-extrabold leading-tight tracking-tight drop-shadow-sm sm:text-3xl"
        initial={reduce ? false : { y: 16, opacity: 0, scale: 0.8 }}
        animate={
          revealed
            ? { y: 0, opacity: 1, scale: [0.8, 1.05, 1] }
            : { y: 0, opacity: 1, scale: 1 }
        }
        transition={
          revealed
            ? { duration: 0.55, times: [0, 0.55, 1], delay: 0.12, ease: [0.22, 1, 0.36, 1] }
            : softSpring
        }
      >
        {prizeName}
      </motion.p>

      {couponCode && (
        <motion.button
          type="button"
          onClick={copyCode}
          aria-label={copied ? "Copied" : `Copy coupon code ${couponCode}`}
          className="play-coupon-shimmer relative mt-4 flex w-full max-w-[280px] items-center justify-between gap-2 rounded-xl border border-dashed border-white/55 bg-white/15 px-3.5 py-3 text-left backdrop-blur-md transition active:scale-[0.98]"
          initial={reduce ? false : { y: 28, opacity: 0, scale: 0.8 }}
          animate={
            revealed
              ? { y: 0, opacity: 1, scale: [0.8, 1.05, 1] }
              : { y: 0, opacity: 1, scale: 1 }
          }
          transition={
            revealed
              ? { duration: 0.5, times: [0, 0.55, 1], delay: 0.35, ease: [0.22, 1, 0.36, 1] }
              : softSpring
          }
          whileTap={reduce ? undefined : { scale: 0.97 }}
        >
          <span className="min-w-0 flex-1 truncate font-mono text-[15px] font-bold tracking-wider text-white">
            {couponCode}
          </span>
          <motion.span
            className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/20"
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={
              revealed
                ? { scale: 1, opacity: 1 }
                : { scale: 1, opacity: 1 }
            }
            transition={{ type: "spring", duration: 0.45, bounce: 0.4, delay: revealed ? 0.55 : 0 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="ok"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={spring}
                >
                  <Check className="size-4 text-white" strokeWidth={2.75} />
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  className="play-copy-pulse"
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  transition={spring}
                >
                  <Copy className="size-4 text-white" strokeWidth={2.25} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.span>
        </motion.button>
      )}

      <AnimatePresence>
        {copied && (
          <motion.p
            role="status"
            className="relative mt-2 text-xs font-semibold text-white"
            initial={{ y: 6, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -4, opacity: 0 }}
            transition={spring}
          >
            ✓ Copied successfully
          </motion.p>
        )}
      </AnimatePresence>

      <motion.div
        className="relative mt-4 flex flex-col items-center gap-1"
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={revealed ? { opacity: 1, y: 0 } : { opacity: 0.85, y: 0 }}
        transition={{ ...softSpring, delay: revealed ? 0.32 : 0 }}
      >
        <Gift className="size-4 text-white/90" strokeWidth={2} />
        <p className="text-[11px] font-medium text-white/85">{instruction}</p>
      </motion.div>
      </div>
    </motion.div>
  );
}

interface ClaimHintCardProps {
  primary: string;
  secondary?: string;
  expiresAt?: string;
  shopUrl?: string | null;
  onShopClick?: () => void;
}

export function ClaimHintCard({
  primary,
  secondary,
  expiresAt,
  shopUrl,
  onShopClick,
}: ClaimHintCardProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-black/5"
      initial={reduce ? false : { y: 24, opacity: 0, filter: "blur(4px)" }}
      animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
      transition={{ ...softSpring, delay: 0.7 }}
    >
      <div className="flex items-start gap-3">
        <motion.div
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
          animate={reduce ? undefined : { y: [0, -3, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
            <path d="M8 8V6a4 4 0 0 1 8 0v2" />
            <circle cx="12" cy="14" r="2.25" />
          </svg>
        </motion.div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-semibold text-neutral-900">{primary}</p>
          {secondary && (
            <p className="mt-0.5 text-sm text-neutral-500">{secondary}</p>
          )}
        </div>
      </div>

      {expiresAt && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden>
            <path d="M5 1.5a.75.75 0 0 1 1.5 0V2h3v-.5a.75.75 0 0 1 1.5 0V2H13a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h1.5V1.5zM3.5 6.5v6.5h9V6.5h-9z" />
          </svg>
          Valid until{" "}
          {new Date(expiresAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
          })}
        </div>
      )}

      {shopUrl && (
        <motion.a
          href={shopUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onShopClick}
          className="mt-3 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-red-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
          whileTap={reduce ? undefined : { scale: 0.98 }}
          whileHover={reduce ? undefined : { y: -1, boxShadow: "0 8px 20px -8px rgba(249,115,22,0.55)" }}
        >
          Shop now with code →
        </motion.a>
      )}
    </motion.div>
  );
}
