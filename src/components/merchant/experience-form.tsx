"use client";

import { useState, useTransition } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { Campaign, ExperienceTheme, PreloaderDuration } from "@/lib/types";
import { updateExperienceAction } from "@/app/m/campaigns/actions";

const DURATION_OPTIONS: PreloaderDuration[] = [300, 600, 1000];
const THEME_OPTIONS: { value: ExperienceTheme; label: string; hint: string }[] = [
  { value: "light", label: "Light", hint: "White background, dark text" },
  { value: "dark", label: "Dark", hint: "Dark background, light text" },
  { value: "brand", label: "Merchant Brand", hint: "Adapts to your reward colors" },
];
const BUTTON_TEXT_EXAMPLES = ["Follow Us", "Visit Website", "Shop Now"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-neutral-700">{label}</label>
      {children}
    </div>
  );
}

function ExpToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 px-4 py-3 cursor-pointer">
      <div>
        <span className="text-sm font-bold text-neutral-900">{label}</span>
        <p className="text-xs text-neutral-500">{hint}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-emerald-600 cursor-pointer shrink-0"
      />
    </label>
  );
}

/** Campaign Settings → Customer Experience (V2 customer app). */
export function ExperienceForm({ campaign }: { campaign: Campaign }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [preloaderEnabled, setPreloaderEnabled] = useState(campaign.exp_preloader_enabled ?? true);
  const [preloaderDuration, setPreloaderDuration] = useState<PreloaderDuration>(
    (campaign.exp_preloader_duration ?? 600) as PreloaderDuration
  );
  const [confetti, setConfetti] = useState(campaign.exp_confetti_enabled ?? true);
  const [sound, setSound] = useState(campaign.exp_sound_enabled ?? false);
  const [haptics, setHaptics] = useState(campaign.exp_haptics_enabled ?? false);
  const [nativeApp, setNativeApp] = useState(campaign.exp_open_native_app ?? true);
  const [countdown, setCountdown] = useState(campaign.exp_show_countdown ?? true);
  const [allowSkip, setAllowSkip] = useState(campaign.exp_allow_skip ?? true);
  const [buttonText, setButtonText] = useState(campaign.exp_button_text ?? "");
  const [theme, setTheme] = useState<ExperienceTheme>(campaign.exp_theme ?? "dark");

  const inputCls =
    "w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition";

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await updateExperienceAction(campaign.id, { error: null }, {
        preloader_enabled: preloaderEnabled,
        preloader_duration: preloaderDuration,
        confetti_enabled: confetti,
        sound_enabled: sound,
        haptics_enabled: haptics,
        open_native_app: nativeApp,
        show_countdown: countdown,
        allow_skip: allowSkip,
        button_text: buttonText.trim(),
        theme,
      });
      if (res.error) setMsg({ type: "error", text: res.error });
      else setMsg({ type: "success", text: "Customer Experience settings saved!" });
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 space-y-5">
      <div>
        <h3 className="font-bold text-neutral-900 text-base flex items-center gap-2">
          <Sparkles className="size-4 text-[#111827]" />
          Customer Experience
        </h3>
        <p className="text-sm text-neutral-500 mt-1">
          Fine-tune how the scratch &amp; win journey looks and feels on your
          customers&apos; phones — splash screen, celebration effects, and the
          redirect countdown.
        </p>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${
          msg.type === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {msg.type === "success" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          {msg.text}
        </div>
      )}

      <div className="grid gap-3">
        <ExpToggle
          label="Enable Preloader"
          hint="Branded splash (logo + campaign name) while the page loads."
          checked={preloaderEnabled}
          onChange={setPreloaderEnabled}
        />

        {preloaderEnabled && (
          <Field label="Preloader Duration (minimum display)">
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPreloaderDuration(d)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                    preloaderDuration === d
                      ? "bg-[#111827] text-white border-[#111827]"
                      : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  {d}ms
                </button>
              ))}
            </div>
          </Field>
        )}

        <ExpToggle
          label="Confetti Animation"
          hint="Celebration burst when the customer reveals a win."
          checked={confetti}
          onChange={setConfetti}
        />
        <ExpToggle
          label="Reward Sound"
          hint="Short chime on the win reveal. Default off."
          checked={sound}
          onChange={setSound}
        />
        <ExpToggle
          label="Haptic Feedback"
          hint="Gentle vibration while scratching (supported phones). Default off."
          checked={haptics}
          onChange={setHaptics}
        />
        <ExpToggle
          label="Open Native App"
          hint="Try the Instagram/WhatsApp/YouTube app before the browser."
          checked={nativeApp}
          onChange={setNativeApp}
        />
        <ExpToggle
          label="Show Countdown"
          hint="Show the 3-2-1 countdown before the Post Win redirect."
          checked={countdown}
          onChange={setCountdown}
        />
        <ExpToggle
          label="Allow Customer To Skip"
          hint={'Show a "Stay Here" button so customers can cancel the redirect.'}
          checked={allowSkip}
          onChange={setAllowSkip}
        />

        <Field label="Redirect Button Text">
          <input
            type="text"
            value={buttonText}
            maxLength={30}
            onChange={(e) => setButtonText(e.target.value)}
            placeholder="Open Now"
            className={inputCls}
          />
          <div className="flex gap-2 mt-1.5">
            {BUTTON_TEXT_EXAMPLES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setButtonText(t)}
                className="text-[11px] font-semibold text-neutral-500 bg-neutral-100 hover:bg-neutral-200 rounded-lg px-2 py-1 transition-colors cursor-pointer"
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Theme">
          <div className="grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTheme(t.value)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                  theme === t.value
                    ? "bg-[#111827] text-white border-[#111827]"
                    : "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50"
                }`}
              >
                <span className="block text-sm font-bold">{t.label}</span>
                <span className={`block text-[11px] mt-0.5 ${theme === t.value ? "text-neutral-300" : "text-neutral-400"}`}>
                  {t.hint}
                </span>
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="pt-4 border-t border-neutral-100">
        <button
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-2 text-sm font-bold px-6 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl transition-colors disabled:opacity-60 cursor-pointer"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Save Experience Settings
        </button>
      </div>
    </div>
  );
}
