"use client";

import { useEffect, useRef, useState } from "react";

interface PreloaderProps {
  businessName: string;
  campaignName: string;
  logoUrl: string | null;
  /** Images to warm before revealing the page (prize art, banner, etc.). */
  preloadImages?: (string | null | undefined)[];
}

const MIN_DURATION = 600;
const MAX_DURATION = 1200;

/**
 * Branded preloader overlay. It is present in the very first paint (rendered
 * inline above the page content) so the customer never sees a blank white
 * screen. It preloads the logo + reward images, then fades out once they are
 * ready — bounded to 600–1200ms so it neither flashes nor blocks. All motion
 * is CSS/compositor-only; prefers-reduced-motion is handled in globals.css.
 */
export function Preloader({
  businessName,
  campaignName,
  logoUrl,
  preloadImages = [],
}: PreloaderProps) {
  const [hidden, setHidden] = useState(false);
  const [gone, setGone] = useState(false);
  const startRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = performance.now();

    const urls = [logoUrl, ...preloadImages].filter(
      (u): u is string => typeof u === "string" && u.length > 0,
    );

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      const elapsed = performance.now() - startRef.current;
      const wait = Math.max(0, MIN_DURATION - elapsed);
      window.setTimeout(() => setHidden(true), wait);
    };

    // Warm the browser cache. We resolve on load OR error so a broken image
    // never traps the customer behind the overlay.
    let remaining = urls.length;
    if (remaining === 0) {
      finish();
    } else {
      for (const url of urls) {
        const img = new Image();
        const done = () => {
          remaining -= 1;
          if (remaining === 0) finish();
        };
        img.onload = done;
        img.onerror = done;
        img.src = url;
      }
    }

    // Hard cap: reveal the page no matter what.
    const cap = window.setTimeout(() => setHidden(true), MAX_DURATION);
    return () => window.clearTimeout(cap);
  }, [logoUrl, preloadImages]);

  // Remove from the DOM after the fade so it stops compositing.
  useEffect(() => {
    if (!hidden) return;
    const t = window.setTimeout(() => setGone(true), 360);
    return () => window.clearTimeout(t);
  }, [hidden]);

  if (gone) return null;

  return (
    <div
      className={`preloader${hidden ? " preloader--hidden" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Loading ${campaignName} at ${businessName}`}
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- preloader art, optimizer skipped intentionally
          <img
            src={logoUrl}
            alt={businessName}
            width={80}
            height={80}
            decoding="async"
            className="preloader__logo h-20 w-20"
          />
        ) : (
          <div className="preloader__logo flex h-20 w-20 items-center justify-center bg-amber-100 text-3xl font-bold text-amber-700">
            {businessName.charAt(0).toUpperCase()}
          </div>
        )}

        <div>
          <p className="text-lg font-bold text-neutral-900">{businessName}</p>
          <p className="mt-0.5 text-sm font-medium text-amber-600">
            {campaignName}
          </p>
        </div>

        <div className="preloader__spinner" aria-hidden />
      </div>
    </div>
  );
}
