import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useCampaign, slugsValid } from "../hooks/useCampaign";
import { usePreloaderGate } from "../hooks/usePreloaderGate";
import { useNetwork } from "../hooks/useNetwork";
import { usePlayStore } from "../store/playStore";
import { trackExperience } from "../services/api";
import { Preloader } from "../components/Preloader";
import { BrandHeader } from "../components/BrandHeader";
import { RegisterForm } from "../components/RegisterForm";
import { ScratchCard } from "../components/ScratchCard";
import { PrizeReveal } from "../components/PrizeReveal";
import { ErrorScreen, FetchErrorScreen } from "../components/ErrorScreen";
import { SmartImage } from "../components/SmartImage";
import { RedirectCountdown } from "../components/RedirectCountdown";
import { DEFAULT_EXPERIENCE, type BlockedStatus, type PlayResult } from "../types";

const BLOCKED_COPY: Record<
  BlockedStatus,
  { emoji: string; title: string; body: string }
> = {
  already_played: {
    emoji: "🎟️",
    title: "You've already played",
    body: "This campaign allows one play per customer. Thanks for taking part!",
  },
  campaign_inactive: {
    emoji: "📅",
    title: "Campaign has ended",
    body: "This campaign isn't running right now. Check back later!",
  },
  campaign_full: {
    emoji: "🎁",
    title: "All prizes claimed",
    body: "This campaign has reached its limit. Better luck next time!",
  },
  rate_limited: {
    emoji: "⏱️",
    title: "Too many attempts",
    body: "Please wait a little while and try again.",
  },
};

type WonResult = Extract<PlayResult, { won: true }>;

export default function CampaignPage() {
  const { merchant = "", campaign = "" } = useParams();
  const valid = slugsValid(merchant, campaign);
  const { data: display, isLoading, isError, refetch } = useCampaign(merchant, campaign);
  const { step, result, customerName, setStep } = usePlayStore();
  const { tier, saveData } = useNetwork();
  const viewedSent = useRef(false);
  const experience = display?.experience ?? DEFAULT_EXPERIENCE;
  const preloader = usePreloaderGate(
    !isLoading,
    experience.preloader_duration,
    experience.preloader_enabled,
  );

  // Low Internet Mode — kill non-essential animation globally
  useEffect(() => {
    document.documentElement.dataset.lowmotion = saveData ? "1" : "0";
  }, [saveData]);

  // Merchant theme: light / dark / brand (brand = dark surface + reward accent)
  useEffect(() => {
    document.documentElement.dataset.theme =
      experience.theme === "light" ? "light" : "dark";
  }, [experience.theme]);

  // apply brand accent from the campaign's first prize color
  useEffect(() => {
    const bg = display?.prizes?.[0]?.background_color;
    if (bg && experience.theme === "brand") {
      document.documentElement.style.setProperty("--brand", bg);
    }
  }, [display, experience.theme]);

  // Prefetch the reveal screen's confetti chunk while the user scratches
  useEffect(() => {
    if (step === "scratch" && !saveData && experience.confetti_enabled) {
      void import("../components/Confetti");
    }
  }, [step, saveData, experience.confetti_enabled]);

  useEffect(() => {
    if (
      step === "revealed" &&
      result?.status === "ok" &&
      result.won &&
      !viewedSent.current
    ) {
      viewedSent.current = true;
      trackExperience(display!.campaign_id, "reward.viewed", {
        prize: result.prize_name,
      });
    }
  }, [step, result, display]);

  if (!valid) {
    return <ErrorScreen emoji="🔍" title="This campaign isn't available" />;
  }
  if (preloader !== "gone") {
    return (
      <Preloader
        logoUrl={display?.logo_url}
        merchantName={display?.business_name}
        campaignName={display?.name}
        leaving={preloader === "leaving"}
      />
    );
  }
  if (isError) return <FetchErrorScreen onRetry={() => void refetch()} />;
  if (!display) {
    return (
      <ErrorScreen
        emoji="📅"
        title="This campaign isn't available"
        body="It may have ended or hasn't started yet."
      />
    );
  }

  const prizeTeaser = display.prizes
    .slice(0, 3)
    .map((p) => p.name)
    .join(" · ");

  const won = result?.status === "ok" && result.won ? (result as WonResult) : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5">
      <BrandHeader
        logoUrl={display.logo_url}
        businessName={display.business_name}
        headline={display.headline}
      />

      <main className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
        {(step === "landing" || step === "register") && (
          <div key="register" className="screen-in flex w-full flex-col items-center gap-6">
            {prizeTeaser && (
              <p className="text-center text-sm text-muted">
                Win:{" "}
                <span className="font-semibold text-ink">{prizeTeaser}</span>
              </p>
            )}
            <RegisterForm merchant={merchant} campaign={campaign} />
          </div>
        )}

        {step === "scratch" && result?.status === "ok" && (
          <div key="scratch" className="screen-in flex flex-col items-center gap-4">
            <p className="text-center text-base font-semibold">
              Scratch to reveal your prize
            </p>
            <ScratchCard
              onReveal={() => {
                if (result.defer_scratch_event) {
                  void trackExperience(display.campaign_id, "scratch.completed", {
                    won: result.won,
                  });
                }
                setStep("revealed");
              }}
              lowPower={tier === "slow"}
              haptics={experience.haptics_enabled}
            >
              {won ? (
                <div
                  className="flex h-full w-full flex-col items-center justify-center gap-2 p-4"
                  style={{ background: won.prize_background_color ?? "#1c1c24" }}
                >
                  {won.prize_image_url && (
                    <SmartImage
                      src={won.prize_image_url}
                      alt=""
                      width={96}
                      height={96}
                      priority
                      className="h-24 w-24 rounded-xl object-contain"
                    />
                  )}
                  <p className="text-center text-lg font-bold">{won.prize_name}</p>
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-card p-4">
                  <p className="text-center text-lg font-semibold text-muted">
                    Better luck next time
                  </p>
                </div>
              )}
            </ScratchCard>
          </div>
        )}

        {step === "revealed" && won && (
          <PrizeReveal
            result={won}
            customerName={customerName}
            campaignId={display.campaign_id}
            redirect={display.redirect}
            experience={experience}
            lowPower={saveData}
          />
        )}

        {step === "revealed" && !won && (
          <div key="lost" className="scale-in flex flex-col items-center gap-3 text-center w-full">
            <p className="text-3xl">🍀</p>
            <h2 className="text-xl font-bold">Better luck next time!</h2>
            <p className="max-w-xs text-sm text-muted">
              Thanks for playing, {customerName || "friend"}. Follow{" "}
              {display.business_name} for more chances to win.
            </p>
            {display.redirect?.enabled && display.redirect.destination_type !== "none" && display.redirect.url && (
              <div className="w-full mt-2">
                <RedirectCountdown
                  campaignId={display.campaign_id}
                  redirect={display.redirect}
                  experience={experience}
                />
              </div>
            )}
          </div>
        )}

        {step === "blocked" && result && result.status !== "ok" && (
          <div key="blocked" className="scale-in flex flex-col items-center gap-3 text-center">
            <p className="text-4xl">{BLOCKED_COPY[result.status].emoji}</p>
            <h2 className="text-xl font-bold">{BLOCKED_COPY[result.status].title}</h2>
            <p className="max-w-xs text-sm text-muted">
              {BLOCKED_COPY[result.status].body}
            </p>
          </div>
        )}
      </main>

      <footer className="safe-b py-4 text-center text-xs text-muted/60">
        Powered by EngageOS
      </footer>
    </div>
  );
}
