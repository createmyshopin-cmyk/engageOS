"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Shield, Zap } from "lucide-react";

interface PreloaderProps {
  businessName: string;
  campaignName: string;
  logoUrl: string | null;
  /** Images to warm before revealing the page (prize art, banner, etc.). */
  preloadImages?: (string | null | undefined)[];
}

const MIN_DURATION = 3000;
const MAX_DURATION = 4200;

const soft = { type: "spring" as const, duration: 0.55, bounce: 0.28 };

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.85 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/**
 * Premium Onam splash / preloader.
 * Timeline: bg → logo → glow → brand → tagline → particles → progress → exit.
 */
export function Preloader({
  businessName,
  campaignName,
  logoUrl,
  preloadImages = [],
}: PreloaderProps) {
  const reduce = useReducedMotion();
  const [hidden, setHidden] = useState(false);
  const [gone, setGone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dots, setDots] = useState(1);
  const [imagesReady, setImagesReady] = useState(false);
  const startRef = useRef(0);
  const finishArmed = useRef(false);

  const particles = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: i,
        left: `${8 + ((i * 17) % 84)}%`,
        top: `${12 + ((i * 23) % 70)}%`,
        delay: i * 0.18,
        kind: i % 3 === 0 ? "flower" : i % 3 === 1 ? "star" : "leaf",
        size: 10 + (i % 4) * 3,
      })),
    []
  );

  // Warm images
  useEffect(() => {
    startRef.current = performance.now();
    const urls = [logoUrl, ...preloadImages].filter(
      (u): u is string => typeof u === "string" && u.length > 0
    );

    let remaining = urls.length;
    const markReady = () => setImagesReady(true);

    if (remaining === 0) {
      markReady();
      return;
    }

    for (const url of urls) {
      const img = new Image();
      const done = () => {
        remaining -= 1;
        if (remaining <= 0) markReady();
      };
      img.onload = done;
      img.onerror = done;
      img.src = url;
    }
  }, [logoUrl, preloadImages]);

  // Progress 0→100 over ~3s
  useEffect(() => {
    if (reduce) {
      setProgress(100);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 3000);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(Math.round(eased * 100));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  // Loading... dots
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setDots((d) => (d % 3) + 1);
    }, 500);
    return () => window.clearInterval(id);
  }, [reduce]);

  // Exit when progress done + images ready (or max cap)
  useEffect(() => {
    if (finishArmed.current) return;

    const elapsed = () => performance.now() - startRef.current;

    const tryFinish = () => {
      if (finishArmed.current) return;
      const e = elapsed();
      const ready = imagesReady || e >= MAX_DURATION;
      const progressed = progress >= 100 || reduce || e >= MAX_DURATION;
      const minOk = e >= (reduce ? 400 : MIN_DURATION) || e >= MAX_DURATION;
      if (ready && progressed && minOk) {
        finishArmed.current = true;
        setHidden(true);
      }
    };

    tryFinish();
    const cap = window.setTimeout(() => {
      if (finishArmed.current) return;
      finishArmed.current = true;
      setHidden(true);
    }, MAX_DURATION);
    return () => window.clearTimeout(cap);
  }, [imagesReady, progress, reduce]);

  if (gone) return null;

  const circumference = 2 * Math.PI * 22;
  const dash = (progress / 100) * circumference;

  return (
    <AnimatePresence onExitComplete={() => setGone(true)}>
      {!hidden && (
        <motion.div
          key="splash"
          className="preloader preloader--premium"
          role="status"
          aria-live="polite"
          aria-label={`Loading ${campaignName} at ${businessName}`}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 1.02,
            filter: reduce ? "none" : "blur(6px)",
            transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
          }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Mandala + waves */}
          <div className="preloader__mandala preloader__mandala--top" aria-hidden />
          <div className="preloader__mandala preloader__mandala--br" aria-hidden />
          <div className="preloader__waves" aria-hidden />

          {/* Floating particles */}
          {!reduce &&
            particles.map((p) => (
              <motion.span
                key={p.id}
                className="preloader__particle absolute"
                style={{ left: p.left, top: p.top, fontSize: p.size }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{
                  opacity: [0.2, 0.65, 0.2],
                  y: [0, -10, 0],
                  rotate: p.kind === "flower" ? [0, 12, 0] : [0, -8, 0],
                  scale: [0.9, 1.1, 0.9],
                }}
                transition={{
                  duration: 3.2 + p.delay,
                  delay: 1.8 + p.delay,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                aria-hidden
              >
                {p.kind === "flower" ? "🌺" : p.kind === "leaf" ? "🍃" : "✦"}
              </motion.span>
            ))}

          <div className="relative z-10 flex w-full max-w-sm flex-col items-center px-6 text-center">
            {/* Logo */}
            <motion.div
              className="relative mb-5"
              initial={reduce ? false : { scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...soft, delay: 0.3 }}
            >
              {/* Glow */}
              <motion.div
                className="preloader__glow absolute inset-[-18px] rounded-full"
                initial={reduce ? false : { opacity: 0 }}
                animate={
                  reduce
                    ? { opacity: 0.35 }
                    : { opacity: [0.25, 0.65, 0.25], scale: [1, 1.06, 1] }
                }
                transition={{
                  delay: 0.7,
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                aria-hidden
              />

              {/* Rotating gold ring */}
              <motion.div
                className="preloader__ring absolute inset-[-6px] rounded-full"
                animate={reduce ? undefined : { rotate: 360 }}
                transition={{ delay: 1, duration: 15, repeat: Infinity, ease: "linear" }}
                aria-hidden
              />

              <motion.div
                className="relative flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg ring-4 ring-[#E8B923]/70"
                animate={reduce ? undefined : { scale: [1, 1.03, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
              >
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt={businessName}
                    width={88}
                    height={88}
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-4xl font-extrabold text-[#C2410C]">
                    {businessName.charAt(0).toUpperCase()}
                  </span>
                )}
              </motion.div>
            </motion.div>

            <motion.p
              className="text-[1.35rem] font-extrabold tracking-tight text-neutral-800"
              initial={reduce ? false : { y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {businessName}
            </motion.p>

            <motion.p
              className="mt-0.5 text-sm font-medium text-orange-600"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.35, duration: 0.4 }}
            >
              {campaignName}
            </motion.p>

            <motion.div
              className="my-3 flex items-center gap-2"
              initial={reduce ? false : { opacity: 0, scaleX: 0.6 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 1.4, duration: 0.4 }}
              aria-hidden
            >
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-amber-400/80" />
              <span className="text-[10px] text-amber-500">✦</span>
              <span className="h-px w-10 bg-gradient-to-l from-transparent to-amber-400/80" />
            </motion.div>

            <motion.div
              className="mb-8"
              initial={reduce ? false : { y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.5 }}
            >
              <p className="text-sm text-neutral-500">Celebrate Onam with</p>
              <p className="mt-0.5 text-base font-bold text-orange-500">
                exciting rewards 🎁
              </p>
            </motion.div>

            {/* Progress ring */}
            <motion.div
              className="relative mb-2"
              initial={reduce ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 2, ...soft }}
            >
              <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
                <defs>
                  <linearGradient id="preloader-stroke" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#F97316" />
                    <stop offset="100%" stopColor="#EAB308" />
                  </linearGradient>
                </defs>
                <circle
                  cx="28"
                  cy="28"
                  r="22"
                  fill="none"
                  stroke="rgba(251, 191, 36, 0.22)"
                  strokeWidth="4"
                />
                <circle
                  cx="28"
                  cy="28"
                  r="22"
                  fill="none"
                  stroke="url(#preloader-stroke)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                  className="transition-[stroke-dasharray] duration-100 ease-linear"
                />
              </svg>
            </motion.div>

            <motion.p
              className="mb-10 text-sm font-medium text-neutral-500"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.1 }}
            >
              Loading{".".repeat(dots)}
            </motion.p>

            {/* Trust pill */}
            <motion.div
              className="flex w-full items-center justify-between gap-1 rounded-full bg-white/70 px-3 py-2.5 shadow-sm ring-1 ring-black/5 backdrop-blur-md"
              initial={reduce ? false : { y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 2.2, duration: 0.45 }}
            >
              <div className="flex flex-1 flex-col items-center gap-0.5">
                <Shield className="size-3.5 text-emerald-500" strokeWidth={2.25} />
                <span className="text-[9px] font-semibold text-neutral-600">100% Secure</span>
              </div>
              <span className="h-6 w-px bg-neutral-200" aria-hidden />
              <div className="flex flex-1 flex-col items-center gap-0.5">
                <Zap className="size-3.5 text-amber-500" strokeWidth={2.25} />
                <span className="text-[9px] font-semibold text-neutral-600">Instant Rewards</span>
              </div>
              <span className="h-6 w-px bg-neutral-200" aria-hidden />
              <div className="flex flex-1 flex-col items-center gap-0.5">
                <WhatsAppGlyph className="size-3.5 text-[#25D366]" />
                <span className="text-[9px] font-semibold text-neutral-600">On WhatsApp</span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
