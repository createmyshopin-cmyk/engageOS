"use client";

/**
 * ProductImage — catalog image with loading shimmer, error fallback, and a
 * branded placeholder when no Shopify image is synced.
 */

import { useState, useMemo, useEffect } from "react";
import { ImageIcon } from "lucide-react";

type Variant = "card" | "thumb";

interface ProductImageProps {
  src: string | null;
  title?: string | null;
  variant?: Variant;
  className?: string;
}

const PLACEHOLDER_PALETTES = [
  { bg: "from-neutral-100 via-neutral-50 to-emerald-50/80", accent: "text-emerald-400/40", ring: "ring-emerald-100" },
  { bg: "from-violet-50 via-white to-violet-100/60", accent: "text-violet-400/40", ring: "ring-violet-100" },
  { bg: "from-amber-50 via-neutral-50 to-orange-50/70", accent: "text-amber-400/40", ring: "ring-amber-100" },
  { bg: "from-sky-50 via-white to-cyan-50/70", accent: "text-sky-400/40", ring: "ring-sky-100" },
  { bg: "from-rose-50 via-neutral-50 to-pink-50/60", accent: "text-rose-400/40", ring: "ring-rose-100" },
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function productInitials(title?: string | null): string {
  if (!title?.trim()) return "P";
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }
  return title.trim().slice(0, 2).toUpperCase();
}

function Placeholder({
  title,
  variant,
  palette,
}: {
  title?: string | null;
  variant: Variant;
  palette: (typeof PLACEHOLDER_PALETTES)[number];
}) {
  const initials = productInitials(title);
  const isCard = variant === "card";

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${palette.bg} overflow-hidden`}
      aria-hidden
    >
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: "radial-gradient(circle, #a3a3a3 0.75px, transparent 0.75px)",
          backgroundSize: "14px 14px",
        }}
      />

      {/* Soft corner glow */}
      <div className="absolute -top-8 -right-8 size-32 rounded-full bg-white/60 blur-2xl" />
      <div className="absolute -bottom-6 -left-6 size-24 rounded-full bg-white/40 blur-xl" />

      <div
        className={`relative flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm shadow-sm ring-1 ${palette.ring} ${
          isCard ? "size-16 sm:size-[4.5rem]" : "size-9"
        }`}
      >
        {title?.trim() ? (
          <span
            className={`font-black text-neutral-700 tracking-tight select-none ${
              isCard ? "text-xl sm:text-2xl" : "text-xs"
            }`}
          >
            {initials}
          </span>
        ) : (
          <ImageIcon className={`${palette.accent} ${isCard ? "size-7" : "size-4"} text-neutral-300`} />
        )}
      </div>

      {isCard && (
        <p className="relative mt-3 px-4 text-center text-[10px] font-semibold text-neutral-400/90 line-clamp-1 max-w-full">
          {title?.trim() ? "No image synced" : "No product image"}
        </p>
      )}
    </div>
  );
}

export function ProductImage({
  src,
  title,
  variant = "card",
  className = "",
}: ProductImageProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    src ? "loading" : "idle"
  );

  const palette = useMemo(() => {
    const key = title?.trim() || "product";
    return PLACEHOLDER_PALETTES[hashString(key) % PLACEHOLDER_PALETTES.length]!;
  }, [title]);

  useEffect(() => {
    setStatus(src ? "loading" : "idle");
  }, [src]);

  const showPlaceholder = !src || status === "error";
  const showShimmer = src && status === "loading";

  const containerClass =
    variant === "card"
      ? `aspect-square bg-white relative overflow-hidden ${className}`
      : `size-14 rounded-xl bg-white relative overflow-hidden shrink-0 border border-neutral-100 ${className}`;

  const imagePad = variant === "card" ? "p-3" : "p-1.5";

  return (
    <div className={containerClass}>
      {showPlaceholder && <Placeholder title={title} variant={variant} palette={palette} />}

      {showShimmer && (
        <div
          className="absolute inset-0 bg-gradient-to-r from-neutral-100 via-neutral-50 to-neutral-100 bg-[length:200%_100%] animate-shimmer"
          aria-hidden
        />
      )}

      {src && status !== "error" && (
        <div
          className={`absolute inset-0 flex items-center justify-center bg-white ${imagePad}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Shopify CDN hosts are unbounded. */}
          <img
            src={src}
            alt={title ?? "Product"}
            loading="lazy"
            onLoad={() => setStatus("loaded")}
            onError={() => setStatus("error")}
            className={`max-h-full max-w-full object-contain transition-opacity duration-300 ${
              status === "loaded" ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      )}
    </div>
  );
}
