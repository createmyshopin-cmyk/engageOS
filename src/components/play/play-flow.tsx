"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ScratchCard } from "@/components/play/scratch-card";
import { isSafeRedirectUrl } from "@/lib/validation";
import { useTracking } from "@/lib/tracking/react";
import type { CampaignDisplay, PlayResult, PrizeType, RedirectDestinationType } from "@/lib/types";

interface PlayFlowProps {
  merchantSlug: string;
  campaignSlug: string;
  display: CampaignDisplay;
  source?: string;
}

function playVictorySound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      ctx.resume();
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

    // Beautiful victory chime arpeggio: E5, G5, C6
    playNote(659.25, now, 0.4);
    playNote(783.99, now + 0.08, 0.4);
    playNote(1046.50, now + 0.16, 0.6);
  } catch (err) {
    console.error("Failed to play sound:", err);
  }
}

type Step =
  | { step: "form" }
  | { step: "scratch"; result: Extract<PlayResult, { status: "ok" }> }
  | { step: "revealed"; result: Extract<PlayResult, { status: "ok" }> }
  | { step: "blocked"; reason: "already_played" | "campaign_inactive" | "campaign_full" | "rate_limited" };

interface FieldErrors {
  name?: string;
  phone?: string;
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
    title: "Too many attempts",
    body: "Please wait a while and try again.",
  },
};

type WinResult = Extract<PlayResult, { status: "ok"; won: true }>;

/** Format an INR amount without forcing decimals on round numbers. */
function inr(value: number | null): string {
  if (value == null) return "";
  return `₹${Number.isInteger(value) ? value.toLocaleString("en-IN") : value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Type-aware reveal copy. The scratch card and win animation stay the
 * same for every prize type; only the instruction line branches so each
 * reward type tells the customer what actually happens next.
 */
function claimInstruction(result: WinResult, endsAt: string): { primary: string; secondary?: string } {
  const type: PrizeType = result.prize_type;
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
        primary: "📸 Take a screenshot of this code now",
        secondary: "Show it at the counter to claim your prize.",
      };
  }
}

/** Whether this prize type shows a redeemable coupon/voucher code. */
function hasCode(type: PrizeType): boolean {
  return type === "coupon" || type === "gift_voucher";
}

/** Fire-and-forget experience event beacon (best-effort, never blocks UI). */
function beacon(campaignId: string, eventType: string, metadata?: Record<string, unknown>) {
  try {
    const payload = JSON.stringify({ campaignId, eventType, metadata });
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
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (showConfetti && canvasRef.current) {
      const colors = ["#F59E0B", "#10B981", "#3B82F6", "#EF4444", "#EC4899", "#8B5CF6"];
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);

      // Create confetti arcing up from bottom center
      const particles = Array.from({ length: 140 }).map(() => ({
        x: w / 2,
        y: h + 20,
        size: Math.random() * 8 + 6,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedX: (Math.random() - 0.5) * 16,
        speedY: -Math.random() * 20 - 10,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
      }));

      let animId: number;
      function loop() {
        if (!ctx) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        let alive = false;

        for (const p of particles) {
          p.x += p.speedX;
          p.y += p.speedY;
          p.speedY += 0.5;
          p.speedX *= 0.98;
          p.rotation += p.rotationSpeed;

          if (p.y < h + 50) {
            alive = true;
          }

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }

        if (alive) {
          animId = requestAnimationFrame(loop);
        } else {
          setShowConfetti(false);
        }
      }

      animId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(animId);
    }
  }, [showConfetti]);

  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    track("registration_started");

    try {
      const res = await fetch("/api/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantSlug, campaignSlug, name, phone, source }),
      });

      const json: unknown = await res.json();
      const data = json as
        | { ok: true; result: PlayResult }
        | { ok: false; error: string; fields?: FieldErrors };

      if (!data.ok) {
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
      setFormError("Network problem. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
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
    return (
      <div className="space-y-4">
        {showConfetti && mounted && createPortal(
          <canvas
            ref={canvasRef}
            className="fixed inset-0 pointer-events-none z-[9999]"
          />,
          document.body
        )}
        <ScratchCard onReveal={() => {
          setState({ step: "revealed", result });
          track("scratch_completed");
          if (result.won) {
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
            <div
              className="flex h-full w-full flex-col items-center justify-center p-4 text-center text-white"
              style={{ backgroundColor: result.prize_background_color ?? "#059669" }}
            >
              <p className="text-sm font-medium uppercase tracking-wide">
                🎉 You won!
              </p>
              {result.prize_image_url && (
                // eslint-disable-next-line @next/next/no-img-element -- customer-facing reward art; skip the optimizer on this hot path
                <img
                  src={result.prize_image_url}
                  alt={result.prize_name}
                  className="mt-2 h-16 w-16 rounded-xl bg-white/20 object-cover"
                />
              )}
              <p className="mt-1 text-2xl font-bold">{result.prize_name}</p>
              {hasCode(result.prize_type) && (
                <p className="mt-2 rounded-lg bg-white/20 px-3 py-1 font-mono text-lg font-bold tracking-wider">
                  {result.coupon_code}
                </p>
              )}
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-neutral-700 p-4 text-center text-white">
              <p className="text-2xl font-bold">Better luck next time!</p>
              <p className="mt-2 text-sm text-neutral-300">
                Thanks for visiting {display.business_name}
              </p>
            </div>
          )}
        </ScratchCard>

        {state.step === "revealed" &&
          (result.won ? (
            (() => {
              const copy = claimInstruction(result, display.ends_at);
              return (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
                    <p className="text-sm font-semibold text-neutral-900">
                      {copy.primary}
                    </p>
                    {copy.secondary && (
                      <p className="mt-1 text-sm text-neutral-600">{copy.secondary}</p>
                    )}
                    {hasCode(result.prize_type) && (
                      <p className="mt-2 text-xs text-neutral-500">
                        Valid until{" "}
                        {new Date(result.expires_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    )}
                  </div>
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
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
                <p className="text-sm text-neutral-600">
                  Follow {display.business_name} for more offers this Onam!
                </p>
              </div>
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
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label
          htmlFor="play-name"
          className="mb-1 block text-sm font-medium text-neutral-800"
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
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          aria-invalid={!!fieldErrors.name}
          aria-describedby={fieldErrors.name ? "play-name-error" : undefined}
        />
        {fieldErrors.name && (
          <p id="play-name-error" className="mt-1 text-sm text-red-600">
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="play-phone"
          className="mb-1 block text-sm font-medium text-neutral-800"
        >
          WhatsApp number
        </label>
        <input
          id="play-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          placeholder="10-digit mobile number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          aria-invalid={!!fieldErrors.phone}
          aria-describedby={fieldErrors.phone ? "play-phone-error" : undefined}
        />
        {fieldErrors.phone && (
          <p id="play-phone-error" className="mt-1 text-sm text-red-600">
            {fieldErrors.phone}
          </p>
        )}
        <p className="mt-1 text-xs text-neutral-500">
          We&apos;ll send you offers on WhatsApp
        </p>
      </div>

      {formError && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-amber-600 py-3.5 text-base font-semibold text-white active:bg-amber-700 disabled:opacity-60"
      >
        {submitting ? "Getting your card…" : "Scratch & Win 🎁"}
      </button>

      <p className="text-center text-xs text-neutral-400">
        One play per person · By playing you agree to receive offers from{" "}
        {display.business_name} on WhatsApp
      </p>
    </form>
  );
}
