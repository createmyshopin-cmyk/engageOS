"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Scroll-reveal wrapper: fades + lifts children in on first view.
 * Respects prefers-reduced-motion.
 * Falls back to fully visible on Server Side Rendering (SSR) and non-JS contexts.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(true);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          io.disconnect();
        }
      },
      { threshold: 0.02 } // Trigger as soon as it clips the viewport
    );

    io.observe(el);

    // Fallback: Force reveal after a reasonable delay if observer fails to fire
    const timerId = setTimeout(() => {
      setRevealed(true);
    }, 600 + delay);

    return () => {
      io.disconnect();
      clearTimeout(timerId);
    };
  }, [delay]);

  // On the server, we render fully visible (opacity: 1) for SEO spiders
  // and non-JS users. On client mount, it transitions smoothly.
  const isVisible = !mounted || revealed;

  return (
    <div
      ref={ref}
      className={`${className} transition-all duration-700 ease-out`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "none" : "translateY(16px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

