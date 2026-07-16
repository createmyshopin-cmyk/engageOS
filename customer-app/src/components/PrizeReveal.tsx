import { lazy, Suspense, useEffect } from "react";
import type { ExperienceSettings, PlayResult, PrizeType, RedirectSettings } from "../types";
import { RedirectCountdown } from "./RedirectCountdown";
import { SmartImage } from "./SmartImage";
import { playRewardChime } from "../utils/sound";

// Confetti is decorative — split it out of the critical reveal path
const Confetti = lazy(() =>
  import("./Confetti").then((m) => ({ default: m.Confetti })),
);

type WonResult = Extract<PlayResult, { won: true }>;

const CLAIM_HINTS: Record<PrizeType, string> = {
  coupon: "Show this coupon code at the counter to claim your prize.",
  gift_voucher: "Show this voucher code at the counter to redeem.",
  physical_gift: "Show this screen at the counter to collect your gift.",
  lucky_draw: "You're in the lucky draw! We'll contact you on WhatsApp.",
  cashback: "Cashback will be credited — keep this screen as proof.",
  wallet_points: "Points added — show this screen at the counter.",
};

function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

interface PrizeRevealProps {
  result: WonResult;
  customerName: string;
  campaignId: string;
  redirect?: RedirectSettings;
  experience: ExperienceSettings;
  /** Low Internet Mode — skip confetti + glow. */
  lowPower?: boolean;
}

export function PrizeReveal({
  result,
  customerName,
  campaignId,
  redirect,
  experience,
  lowPower,
}: PrizeRevealProps) {
  const expiry = formatExpiry(result.expires_at);
  const showCode =
    result.coupon_code &&
    (result.prize_type === "coupon" || result.prize_type === "gift_voucher");
  const showConfetti = experience.confetti_enabled && !lowPower;

  useEffect(() => {
    if (experience.sound_enabled) playRewardChime();
    // fire once on mount — the reveal moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scale-in flex flex-col items-center gap-4 text-center">
      {showConfetti && (
        <Suspense fallback={null}>
          <Confetti />
        </Suspense>
      )}
      <p className="text-sm font-medium text-brand">
        Congratulations{customerName ? `, ${customerName}` : ""}! 🎉
      </p>
      <div
        className={`flex w-full max-w-xs flex-col items-center gap-3 rounded-3xl p-6 ${lowPower ? "" : "prize-glow"}`}
        style={{ background: result.prize_background_color ?? "#17171d" }}
      >
        {result.prize_image_url && (
          <SmartImage
            src={result.prize_image_url}
            alt={result.prize_name}
            width={128}
            height={128}
            priority
            className="h-32 w-32 rounded-2xl object-contain"
          />
        )}
        <h2 className="text-2xl font-bold">{result.prize_name}</h2>
        {result.prize_value != null && result.prize_value > 0 && (
          <p className="text-sm opacity-80">Worth ₹{result.prize_value}</p>
        )}
      </div>
      {showCode && (
        <div className="w-full max-w-xs rounded-2xl border border-dashed border-brand/60 bg-card px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted">Your code</p>
          <p className="text-2xl font-bold tracking-widest text-brand">
            {result.coupon_code}
          </p>
        </div>
      )}
      <p className="max-w-xs text-sm text-muted">{CLAIM_HINTS[result.prize_type]}</p>
      {expiry && <p className="text-xs text-muted">Valid until {expiry}</p>}
      {redirect?.enabled && redirect.destination_type !== "none" && redirect.url && (
        <RedirectCountdown
          campaignId={campaignId}
          redirect={redirect}
          experience={experience}
        />
      )}
    </div>
  );
}
