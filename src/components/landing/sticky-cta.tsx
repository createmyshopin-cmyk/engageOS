"use client";

import { useEffect, useState } from "react";
import { ConversionButtons } from "./conversion-buttons";

/**
 * Mobile-only sticky bottom CTA bar. Appears after the user scrolls
 * past the hero so it never covers the hero's own buttons.
 */
export function StickyCta({ waHref }: { waHref: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 560);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ease-in-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0 pointer-events-none"
      } 
      inset-x-0 bottom-0 border-t border-neutral-150 bg-white/85 p-3.5 backdrop-blur-md
      md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:inset-x-auto md:w-auto md:min-w-[380px] md:rounded-full md:border md:border-neutral-200/60 md:shadow-xl md:shadow-neutral-200/40 md:p-2 md:flex md:items-center md:justify-between md:gap-3 md:bg-white/90`}
    >

      <div className="hidden md:flex items-center gap-2 pl-3">
        <span className="h-2 w-2 rounded-full bg-violet-650 animate-pulse" />
        <span className="text-[11px] font-bold text-neutral-800 tracking-tight">Onam Campaign Special</span>
      </div>
      <div className="w-full md:w-auto">
        <ConversionButtons variant="sticky" />
      </div>
    </div>
  );
}


