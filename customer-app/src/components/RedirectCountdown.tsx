import { useCallback, useEffect, useRef, useState } from "react";
import type { ExperienceSettings, RedirectSettings } from "../types";
import { trackExperience } from "../services/api";
import { isSafeRedirectUrl, toDeepLink } from "../utils";

interface RedirectCountdownProps {
  campaignId: string;
  redirect: RedirectSettings;
  experience: ExperienceSettings;
}

const LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  website: "our website",
  product: "the product page",
  custom: "the page",
};

function CountdownRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const progress = total > 0 ? remaining / total : 0;
  return (
    <span className="relative inline-flex h-10 w-10 items-center justify-center">
      <svg className="ring absolute inset-0" width="40" height="40" viewBox="0 0 40 40" aria-hidden>
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
        />
      </svg>
      <span className="text-base font-bold text-brand">{remaining}</span>
    </span>
  );
}

export function RedirectCountdown({ campaignId, redirect, experience }: RedirectCountdownProps) {
  const [remaining, setRemaining] = useState<number>(redirect.delay);
  const [state, setState] = useState<"counting" | "opening" | "cancelled" | "opened">(
    "counting",
  );
  const startedRef = useRef(false);

  const url = redirect.url;
  const safe = !!url && isSafeRedirectUrl(url);
  const label = LABELS[redirect.destination_type] ?? "the page";
  const openLabel = experience.button_text?.trim() || "Open Now";

  const open = useCallback(() => {
    if (!url || !safe) return;
    setState("opening");
    trackExperience(campaignId, "redirect.opened", {
      destination: redirect.destination_type,
    });
    const finish = () => {
      setState("opened");
      trackExperience(campaignId, "redirect.completed", {
        destination: redirect.destination_type,
      });
    };
    const deepLink = experience.open_native_app
      ? toDeepLink(redirect.destination_type, url)
      : null;
    if (deepLink) {
      // try native app, fall back to https shortly after
      const fallback = setTimeout(() => {
        window.open(url, "_blank", "noopener");
        finish();
      }, 700);
      window.addEventListener(
        "visibilitychange",
        () => {
          if (document.hidden) {
            clearTimeout(fallback);
            finish();
          }
        },
        { once: true },
      );
      window.location.href = deepLink;
    } else {
      window.open(url, "_blank", "noopener");
      finish();
    }
  }, [campaignId, redirect.destination_type, safe, url, experience.open_native_app]);

  useEffect(() => {
    if (!safe || state !== "counting") return;
    if (!startedRef.current) {
      startedRef.current = true;
      trackExperience(campaignId, "redirect.started", {
        destination: redirect.destination_type,
        delay: redirect.delay,
      });
    }
    if (remaining <= 0) {
      open();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, state, safe, open, campaignId, redirect]);

  if (!safe) return null;

  return (
    <div className="fade-up mt-6 flex flex-col items-center gap-4">
      {state === "counting" && redirect.delay > 0 && experience.show_countdown && (
        <div className="flex items-center gap-3">
          <CountdownRing remaining={remaining} total={redirect.delay} />
          <p className="text-sm text-muted">Taking you to {label}</p>
        </div>
      )}
      {state === "opening" && (
        <div className="flex items-center gap-3">
          <span className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
          <p className="text-sm font-medium">Opening {label}…</p>
        </div>
      )}
      {state === "opened" && (
        <p className="text-sm text-muted">
          Didn't open? Tap "{openLabel}" again.
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={open}
          className="press rounded-full bg-brand px-6 py-3 text-sm font-semibold text-black"
        >
          {openLabel}
        </button>
        {state === "counting" && experience.allow_skip && (
          <button
            type="button"
            onClick={() => {
              setState("cancelled");
              trackExperience(campaignId, "redirect.cancelled", {
                destination: redirect.destination_type,
              });
            }}
            className="press rounded-full border border-white/15 px-6 py-3 text-sm font-semibold"
          >
            Stay Here
          </button>
        )}
      </div>
    </div>
  );
}
