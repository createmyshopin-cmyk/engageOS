"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Check, User } from "lucide-react";
import { ScratchCard } from "@/components/play/scratch-card";
import { unlockScratchAudio } from "@/components/play/scratch-audio";
import { TrustBar } from "@/components/play/trust-bar";
import { WinConfetti } from "@/components/play/win-confetti";
import { ClaimHintCard, WinRevealCard } from "@/components/play/win-reveal";
import { GoldenAura } from "@/components/play/golden-aura";
import { getOrCreateDeviceId } from "@/lib/play/device-id";
import { shopifyDiscountUrl } from "@/lib/shopify/storefront-url";
import { isSafeRedirectUrl } from "@/lib/validation";
import { useTracking } from "@/lib/tracking/react";
import type { CampaignDisplay, PlayResult, PrizeType, RedirectDestinationType } from "@/lib/types";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.85 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

interface PlayFlowProps {
  merchantSlug: string;
  campaignSlug: string;
  display: CampaignDisplay;
  source?: string;
}

function playVictorySound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const now = ctx.currentTime;

    const playNote = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    // Victory chime: E5, G5, C6
    playNote(659.25, now, 0.4);
    playNote(783.99, now + 0.08, 0.4);
    playNote(1046.5, now + 0.16, 0.6);

    window.setTimeout(() => {
      void ctx.close();
    }, 900);
  } catch {
    /* ignore unsupported audio */
  }
}

type Step =
  | { step: "form" }
  | { step: "preparing" }
  | { step: "scratch"; result: Extract<PlayResult, { status: "ok" }> }
  | { step: "revealed"; result: Extract<PlayResult, { status: "ok" }> }
  | { step: "blocked"; reason: "already_played" | "campaign_inactive" | "campaign_full" | "rate_limited" };

interface FieldErrors {
  name?: string;
  phone?: string;
  whatsappConsent?: string;
}

const BLOCKED_MESSAGES: Record<
  Extract<Step, { step: "blocked" }>["reason"],
  { title: string; body: string }
> = {
  already_played: {
    title: "You've already played!",
    body: "This offer is one play per person. If you won, check your WhatsApp for the coupon.",
  },
  campaign_inactive: {
    title: "This campaign has ended",
    body: "Ask the store about their next offer!",
  },
  campaign_full: {
    title: "All plays are taken",
    body: "This campaign has reached its limit. Ask the store about their next offer!",
  },
  rate_limited: {
    title: "Please wait a moment",
    body: "Wait 5 seconds before trying again.",
  },
};

type WinResult = Extract<PlayResult, { status: "ok"; won: true }>;

/** Format an INR amount without forcing decimals on round numbers. */
function inr(value: number | null): string {
  if (value == null) return "";
  return `₹${Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Human-readable host for a store URL (falls back to the raw value). */
function prettyHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Type-aware reveal copy. The scratch card and win animation stay the
 * same for every prize type; only the instruction line branches so each
 * reward type tells the customer what actually happens next.
 */
function claimInstruction(result: WinResult, endsAt: string): { primary: string; secondary?: string } {
  const type: PrizeType = result.prize_type;
  // Coupon Drop: the code is redeemable online at the merchant's Shopify store.
  if (result.redeem_online && hasCode(type)) {
    return {
      primary: result.discount_summary
        ? `🛍️ ${result.discount_summary} — use this code at checkout.`
        : "🛍️ Use this code at checkout to redeem your discount.",
      secondary: result.store_url
        ? `Shop now at ${prettyHost(result.store_url)}.`
        : "Copy the code and apply it in your cart.",
    };
  }
  switch (type) {
    case "physical_gift":
      return { primary: "🎁 Show this screen at the counter to collect your gift." };
    case "cashback":
      return {
        primary: `💸 ${inr(result.prize_value)} cashback is on its way.`,
        secondary: "Show this screen at the counter to claim it.",
      };
    case "wallet_points":
      return {
        primary: `⭐ +${result.prize_value ?? 0} points added to your wallet.`,
        secondary: "Show this screen at the counter to confirm.",
      };
    case "lucky_draw":
      return {
        primary: "🎟️ You're entered into the lucky draw!",
        secondary: `Winners are picked after ${new Date(endsAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}. We'll notify you on WhatsApp.`,
      };
    case "gift_voucher":
      return {
        primary: `🎫 ${inr(result.prize_value)} gift voucher`,
        secondary: "Show the code at the counter to redeem.",
      };
    case "coupon":
    default:
      return {
        primary: "Take a screenshot of this code now",
        secondary: "Show it at the counter to claim your prize.",
      };
  }
}

/** Whether this prize type shows a redeemable coupon/voucher code. */
function hasCode(type: PrizeType): boolean {
  return type === "coupon" || type === "gift_voucher";
}

/**
 * Short “Just a moment” bridge while /api/play runs.
 * Feels instant when the network is fast; never leaves a blank gap.
 */
function PreparingCard({ businessName }: { businessName: string }) {
  return (
    <div
      className="play-fade-up flex flex-col items-center justify-center rounded-2xl bg-white px-6 py-12 text-center shadow-md ring-1 ring-black/5"
      role="status"
      aria-live="polite"
      aria-label="Preparing your scratch card"
    >
      <div className="relative mb-5 flex size-16 items-center justify-center">
        <span
          className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-400 to-amber-300 opacity-30 blur-md"
          aria-hidden
        />
        <span
          className="play-prepare-spin absolute inset-0 rounded-full border-[3px] border-orange-200 border-t-orange-500"
          aria-hidden
        />
        <span className="relative text-2xl" aria-hidden>
          🎁
        </span>
      </div>
      <p className="text-lg font-extrabold tracking-tight text-neutral-900">
        Just a moment…
      </p>
      <p className="mt-1.5 max-w-[240px] text-sm text-neutral-500">
        Preparing your scratch card from {businessName}
      </p>
      <div className="mt-6 flex gap-1.5" aria-hidden>
        <span className="play-prepare-dot size-1.5 rounded-full bg-orange-400" />
        <span className="play-prepare-dot size-1.5 rounded-full bg-orange-400 [animation-delay:150ms]" />
        <span className="play-prepare-dot size-1.5 rounded-full bg-orange-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

/** Fire-and-forget experience event beacon (best-effort, never blocks UI). */
function beacon(campaignId: string, eventType: string, metadata?: Record<string, unknown>) {
  try {
    const payload = JSON.stringify({
      campaignId,
      eventType,
      metadata,
      deviceId: getOrCreateDeviceId(),
    });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/experience", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/experience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Build a native deep link (with an https fallback) from a destination type +
 * https URL. We never block the customer: the app link is attempted, and the
 * https URL always works in a browser if the app isn't installed.
 */
function buildDeepLink(type: RedirectDestinationType, url: string): { app: string | null; web: string } {
  const web = url;
  try {
    const u = new URL(url);
    const handle = u.pathname.replace(/^\/+|\/+$/g, "");
    switch (type) {
      case "instagram":
        return { app: handle ? `instagram://user?username=${handle}` : null, web };
      case "whatsapp": {
        // wa.me/<number> or api.whatsapp.com/send?phone=
        const phone = handle || u.searchParams.get("phone") || "";
        return { app: phone ? `whatsapp://send?phone=${phone}` : null, web };
      }
      case "telegram":
        return { app: handle ? `tg://resolve?domain=${handle}` : null, web };
      case "youtube":
        return { app: `vnd.youtube://${u.host}${u.pathname}${u.search}`, web };
      case "tiktok":
        return { app: null, web };
      case "facebook":
        return { app: null, web };
      default:
        return { app: null, web };
    }
  } catch {
    return { app: null, web };
  }
}

/**
 * Post Win redirect: shows the reward, counts down, then opens the destination
 * in a new tab (native app link first, https fallback). The customer stays in
 * control — Open Now, Stay Here, or Cancel — and is never blocked.
 */
function RedirectCountdown({
  campaignId,
  destinationType,
  url,
  delay,
  businessName,
  track,
}: {
  campaignId: string;
  destinationType: RedirectDestinationType;
  url: string;
  delay: number;
  businessName: string;
  track: (event: import("@/lib/tracking/types").TrackingEventName, payload?: Record<string, unknown>) => void;
}) {
  const [remaining, setRemaining] = useState(delay);
  const [cancelled, setCancelled] = useState(false);
  const [opened, setOpened] = useState(false);
  const openedRef = useRef(false);

  const open = useCallback(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    setOpened(true);
    // Final safety gate: never navigate to a non-https/local/private target,
    // even if a stale or tampered value reaches the client.
    if (!isSafeRedirectUrl(url)) {
      beacon(campaignId, "redirect.cancelled", { destinationType, reason: "unsafe_url" });
      return;
    }
    const { app, web } = buildDeepLink(destinationType, url);
    beacon(campaignId, "redirect.opened", { destinationType, url });
    track("redirect_clicked", { destination: destinationType, url });
    if (destinationType === "website" || destinationType === "product") {
      track("shop_now_clicked", { destination: destinationType, url });
    }
    // Try the native app link first (silently fails if not installed), then
    // always open the https URL so the customer reaches the destination.
    if (app) {
      try {
        window.location.href = app;
      } catch {
        /* ignore */
      }
    }
    window.open(web, "_blank", "noopener,noreferrer");
    beacon(campaignId, "redirect.completed", { destinationType });
  }, [campaignId, destinationType, url, track]);

  // Announce the redirect has started once.
  useEffect(() => {
    beacon(campaignId, "redirect.started", { destinationType, delay });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Countdown tick.
  useEffect(() => {
    if (cancelled || opened) return;
    if (remaining <= 0) {
      open();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, cancelled, opened, open]);

  function cancel() {
    setCancelled(true);
    beacon(campaignId, "redirect.cancelled", { destinationType });
  }

  if (cancelled) {
    return (
      <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
        <p className="text-sm text-neutral-600">
          You&apos;re all set. Thanks for playing with {businessName}!
        </p>
        <button
          type="button"
          onClick={() => {
            setCancelled(false);
            openedRef.current = false;
            setRemaining(0);
          }}
          className="mt-2 text-sm font-semibold text-amber-600 underline"
        >
          Open the offer anyway
        </button>
      </div>
    );
  }

  if (opened) {
    return (
      <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
        <p className="text-sm text-neutral-600">Opening your offer…</p>
        <button
          type="button"
          onClick={() => {
            openedRef.current = false;
            open();
          }}
          className="mt-2 text-sm font-semibold text-amber-600 underline"
        >
          Didn&apos;t open? Tap here
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">
        Taking you to {businessName} in{" "}
        <span className="font-bold text-amber-600">{remaining}</span>…
      </p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={open}
          className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white active:bg-amber-700"
        >
          Open Now
        </button>
        <button
          type="button"
          onClick={cancel}
          className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 active:bg-neutral-100"
        >
          Stay Here
        </button>
      </div>
    </div>
  );
}

export function PlayFlow({ merchantSlug, campaignSlug, display, source }: PlayFlowProps) {
  const { track } = useTracking();
  const [state, setState] = useState<Step>({ step: "form" });
  const [name, setName] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [phone, setPhone] = useState("");
  const [whatsappConsent, setWhatsappConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const hideConfetti = useCallback(() => setShowConfetti(false), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    track("registration_started");

    // Unlock HTMLAudio on the same user gesture (required for iOS Safari).
    unlockScratchAudio();
    // Instant next screen — never leave the form staring while the API runs.
    setState({ step: "preparing" });

    try {
      const res = await fetch("/api/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantSlug,
          campaignSlug,
          name,
          phone,
          whatsappConsent,
          source,
          deviceId: getOrCreateDeviceId(),
        }),
      });

      const json: unknown = await res.json();
      const data = json as
        | { ok: true; result: PlayResult }
        | { ok: false; error: string; fields?: FieldErrors };

      if (!data.ok) {
        setState({ step: "form" });
        setFieldErrors(data.fields ?? {});
        setFormError(data.fields ? null : data.error);
        return;
      }

      const result = data.result;
      if (result.status === "ok") {
        track("registration_completed");
        track("scratch_started");
        setState({ step: "scratch", result });
      } else {
        setState({ step: "blocked", reason: result.status });
      }
    } catch {
      setState({ step: "form" });
      setFormError("Network problem. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (state.step === "preparing") {
    return <PreparingCard businessName={display.business_name} />;
  }

  if (state.step === "blocked") {
    const msg = BLOCKED_MESSAGES[state.reason];
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-neutral-900">{msg.title}</p>
        <p className="mt-2 text-sm text-neutral-600">{msg.body}</p>
      </div>
    );
  }

  if (state.step === "scratch" || state.step === "revealed") {
    const { result } = state;
    const revealed = state.step === "revealed";
    return (
      <div className="space-y-4">
        <WinConfetti active={showConfetti} onDone={hideConfetti} />
        <GoldenAura>
        <ScratchCard
          soundEnabled
          onReveal={() => {
          setState({ step: "revealed", result });
          if ("defer_scratch_event" in result && result.defer_scratch_event) {
            beacon(display.campaign_id, "scratch.completed", { won: result.won });
          }
          track("scratch_completed");
          if (result.won) {
            try {
              if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                navigator.vibrate(80);
              }
            } catch {
              /* ignore unsupported devices */
            }
            beacon(display.campaign_id, "reward.viewed", { prizeType: result.prize_type });
            track("reward_won", {
              rewardName: result.prize_name,
              prizeType: result.prize_type,
              value: result.prize_value ?? undefined,
            });
            if (hasCode(result.prize_type)) {
              track("coupon_generated", {
                couponId: result.coupon_code,
                couponType: result.prize_type,
                rewardName: result.prize_name,
              });
              track("coupon_viewed", {
                couponId: result.coupon_code,
                couponType: result.prize_type,
              });
            }
            const confettiEnabled = display.experience ? display.experience.confetti_enabled : true;
            const soundEnabled = display.experience ? display.experience.sound_enabled : true;
            if (confettiEnabled) {
              setShowConfetti(true);
            }
            if (soundEnabled) {
              playVictorySound();
            }
          }
          track("campaign_completed", { won: result.won });
        }}>
          {result.won ? (
            <WinRevealCard
              prizeName={result.prize_name}
              couponCode={hasCode(result.prize_type) ? result.coupon_code : null}
              prizeImageUrl={result.prize_image_url}
              backgroundColor={result.prize_background_color}
              revealed={revealed}
              instruction={
                result.redeem_online
                  ? "Use this code at checkout"
                  : "Use this code on your next purchase"
              }
            />
          ) : (
            <div className="play-prize-pop flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-neutral-700 to-neutral-800 p-5 text-center text-white">
              <p className="text-2xl font-extrabold">Better luck next time!</p>
              <p className="mt-2 text-sm text-neutral-300">
                Thanks for visiting {display.business_name}
              </p>
            </div>
          )}
        </ScratchCard>
        </GoldenAura>

        {revealed &&
          (result.won ? (
            (() => {
              const copy = claimInstruction(result, display.ends_at);
              const primary = copy.primary.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\s]+/u, "");
              return (
                <div className="space-y-3">
                  <ClaimHintCard
                    primary={primary}
                    secondary={copy.secondary}
                    expiresAt={
                      hasCode(result.prize_type) ? result.expires_at : undefined
                    }
                    shopUrl={
                      result.redeem_online && result.store_url && result.coupon_code
                        ? shopifyDiscountUrl(result.store_url, result.coupon_code)
                        : null
                    }
                    onShopClick={() =>
                      track("shop_now_clicked", {
                        destination: "shopify_discount",
                        url:
                          result.store_url && result.coupon_code
                            ? shopifyDiscountUrl(result.store_url, result.coupon_code)
                            : undefined,
                        coupon_code: result.coupon_code,
                      })
                    }
                  />
                  <TrustBar />
                  {display.redirect?.enabled &&
                    display.redirect.destination_type !== "none" &&
                    display.redirect.url && (
                      <RedirectCountdown
                        campaignId={display.campaign_id}
                        destinationType={display.redirect.destination_type}
                        url={display.redirect.url}
                        delay={display.redirect.delay}
                        businessName={display.business_name}
                        track={track}
                      />
                    )}
                </div>
              );
            })()
          ) : (
            <div className="space-y-3">
              <ClaimHintCard
                primary={`Follow ${display.business_name} for more offers this Onam!`}
              />
              <TrustBar />
              {display.redirect?.enabled &&
                display.redirect.destination_type !== "none" &&
                display.redirect.url && (
                  <RedirectCountdown
                    campaignId={display.campaign_id}
                    destinationType={display.redirect.destination_type}
                    url={display.redirect.url}
                    delay={display.redirect.delay}
                    businessName={display.business_name}
                    track={track}
                  />
                )}
            </div>
          ))}
      </div>
    );
  }

  return (
    <>
    <form
      onSubmit={handleSubmit}
      className="play-fade-up space-y-5 rounded-2xl bg-white p-5 shadow-md ring-1 ring-black/5 sm:p-6"
      noValidate
    >
      <div className="flex gap-3">
        <div
          aria-hidden
          className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-500"
        >
          <User className="size-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <label
            htmlFor="play-name"
            className="mb-1.5 block text-sm font-semibold text-neutral-800"
          >
            Your name
          </label>
          <input
            id="play-name"
            type="text"
            autoComplete="name"
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-base text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            aria-invalid={!!fieldErrors.name}
            aria-describedby={fieldErrors.name ? "play-name-error" : undefined}
          />
          {fieldErrors.name && (
            <p id="play-name-error" className="mt-1 text-sm text-red-600">
              {fieldErrors.name}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <div
          aria-hidden
          className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#25D366]"
        >
          <WhatsAppIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <label
            htmlFor="play-phone"
            className="mb-1.5 block text-sm font-semibold text-neutral-800"
          >
            WhatsApp number
          </label>
          <div className="flex overflow-hidden rounded-xl border border-neutral-200 bg-white focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100">
            <div
              className="flex shrink-0 items-center gap-1.5 border-r border-neutral-200 bg-neutral-50 px-3 text-sm font-medium text-neutral-700"
              aria-label="Country code India +91"
            >
              <span className="text-base leading-none" aria-hidden>
                🇮🇳
              </span>
              <span>+91</span>
              <svg
                viewBox="0 0 12 12"
                className="size-2.5 text-neutral-400"
                fill="currentColor"
                aria-hidden
              >
                <path d="M2.2 4.2a.75.75 0 0 1 1.06 0L6 6.94l2.74-2.74a.75.75 0 1 1 1.06 1.06l-3.27 3.27a.75.75 0 0 1-1.06 0L2.2 5.26a.75.75 0 0 1 0-1.06z" />
              </svg>
            </div>
            <input
              id="play-phone"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="tel"
              required
              maxLength={10}
              placeholder="Enter 10-digit mobile number"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-neutral-900 placeholder:text-neutral-400 outline-none"
              aria-invalid={!!fieldErrors.phone}
              aria-describedby={
                fieldErrors.phone ? "play-phone-error" : "play-phone-hint"
              }
            />
          </div>
          {fieldErrors.phone ? (
            <p id="play-phone-error" className="mt-1.5 text-sm text-red-600">
              {fieldErrors.phone}
            </p>
          ) : (
            <p
              id="play-phone-hint"
              className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600"
            >
              <Check className="size-3.5 shrink-0" strokeWidth={2.5} />
              We&apos;ll send you offers on WhatsApp
            </p>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/80 px-2.5 py-2 text-xs text-neutral-600">
        <input
          type="checkbox"
          checked={whatsappConsent}
          onChange={(event) => setWhatsappConsent(event.target.checked)}
          required
          className="size-3.5 shrink-0 rounded border-emerald-300 accent-emerald-600"
        />
        <span>I agree to terms and conditions</span>
      </label>
      {fieldErrors.whatsappConsent && (
        <p className="text-sm text-red-600">{fieldErrors.whatsappConsent}</p>
      )}

      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-red-500 py-3.5 text-base font-semibold text-white shadow-sm transition active:brightness-95 disabled:opacity-60"
      >
        {submitting ? "Just a moment…" : "Scratch & Win 🎁"}
      </button>
    </form>
    <TrustBar />
    </>
  );
}
