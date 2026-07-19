"use client";

import { motion, useReducedMotion } from "framer-motion";

interface BrandHeaderProps {
  businessName: string;
  campaignName: string;
  logoUrl: string | null;
  headline?: string;
}

function highlightHeadline(text: string) {
  const parts = text.split(/(Onam!?)/gi);
  return parts.map((part, i) =>
    /^Onam!?$/i.test(part) ? (
      <span key={i} className="text-[#FF6B00]">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

const soft = { type: "spring" as const, duration: 0.45, bounce: 0.3 };

export function BrandHeader({
  businessName,
  campaignName,
  logoUrl,
  headline,
}: BrandHeaderProps) {
  const reduce = useReducedMotion();

  return (
    <header className="relative mb-5 text-center">
      <motion.div
        className="relative mx-auto mb-3 inline-flex"
        initial={reduce ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...soft, delay: 0.2 }}
      >
        {/* Soft glow loop */}
        {!reduce && (
          <motion.span
            className="absolute inset-[-10px] rounded-full bg-amber-400/30 blur-xl"
            animate={{ opacity: [0.25, 0.55, 0.25], scale: [1, 1.08, 1] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          />
        )}

        <motion.div
          className="relative"
          animate={reduce ? undefined : { scale: [1, 1.04, 1] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Slow rotating gold ring */}
          {!reduce && (
            <motion.span
              className="absolute inset-[-5px] rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, #E8B923, #F59E0B, #FDE68A, #E8B923, #B45309, #E8B923)",
                WebkitMask:
                  "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
                mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              aria-hidden
            />
          )}

          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={businessName}
              width={72}
              height={72}
              // @ts-expect-error fetchpriority is a valid HTML attribute React forwards
              fetchpriority="high"
              decoding="async"
              className="relative h-[72px] w-[72px] rounded-full object-cover shadow-md ring-2 ring-white"
            />
          ) : (
            <div
              aria-hidden
              className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-orange-100 text-3xl font-extrabold text-[#C2410C] shadow-md ring-2 ring-white"
            >
              {businessName.charAt(0).toUpperCase()}
            </div>
          )}
        </motion.div>
      </motion.div>

      <motion.div
        initial={reduce ? false : { y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...soft, delay: 0.4 }}
      >
        {headline ? (
          <h1 className="text-[1.7rem] font-extrabold leading-tight tracking-tight text-neutral-900 sm:text-3xl">
            {highlightHeadline(headline)}
          </h1>
        ) : (
          <h1 className="text-xl font-extrabold text-neutral-900">{businessName}</h1>
        )}
      </motion.div>

      <motion.p
        className="mt-2 flex items-center justify-center gap-2 text-sm text-neutral-600"
        initial={reduce ? false : { y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...soft, delay: 0.55 }}
      >
        <motion.span
          aria-hidden
          className="text-orange-400"
          animate={reduce ? undefined : { rotate: [0, 12, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        >
          🌸
        </motion.span>
        <span>
          at <span className="font-semibold text-[#FF6B00]">{businessName}</span>
        </span>
        <motion.span
          aria-hidden
          className="text-orange-400"
          animate={reduce ? undefined : { rotate: [0, -12, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
        >
          🌸
        </motion.span>
      </motion.p>

      {headline ? (
        <motion.p
          className="mt-1 text-xs text-neutral-500"
          initial={reduce ? false : { opacity: 0 }}
          animate={
            reduce
              ? { opacity: 1 }
              : { opacity: [0.7, 1, 0.7] }
          }
          transition={
            reduce
              ? { duration: 0.4, delay: 0.7 }
              : { duration: 3, delay: 0.7, repeat: Infinity, ease: "easeInOut" }
          }
        >
          Celebrate Onam with exciting rewards 🪷
        </motion.p>
      ) : (
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-amber-600">
          {campaignName}
        </p>
      )}
    </header>
  );
}
