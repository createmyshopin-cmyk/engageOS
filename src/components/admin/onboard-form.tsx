"use client";

import { useActionState, useState } from "react";
import {
  onboardMerchantAction,
  type ActionState,
} from "@/app/admin/actions";

const initial: ActionState = { error: null };

interface PrizeRow {
  name: string;
  quantity: string;
  tier: "everyone" | "common" | "rare";
}

const DEFAULT_PRIZES: PrizeRow[] = [
  { name: "5% OFF next purchase", quantity: "10000", tier: "everyone" },
  { name: "10% OFF today", quantity: "100", tier: "common" },
  { name: "", quantity: "10", tier: "rare" },
];

const TIER_LABELS: Record<PrizeRow["tier"], string> = {
  everyone: "Everyone wins",
  common: "Common",
  rare: "Rare (big prize)",
};

const TIER_STYLES: Record<PrizeRow["tier"], string> = {
  everyone: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  common: "bg-sky-50 text-sky-700 ring-sky-600/20",
  rare: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

function defaultEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 21); // 3 weeks — covers the Onam season window
  return d.toISOString().slice(0, 10);
}

export function OnboardForm() {
  const [state, action, pending] = useActionState(onboardMerchantAction, initial);
  const [prizes, setPrizes] = useState<PrizeRow[]>(DEFAULT_PRIZES);

  function updatePrize(i: number, patch: Partial<PrizeRow>) {
    setPrizes((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <form action={action} className="space-y-5">
      <Section
        step={1}
        title="The shop"
        subtitle="Where the campaign runs."
      >
        <Field label="Shop name" name="businessName" placeholder="Ammu Textiles" required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City" name="city" placeholder="Thrissur" />
          <Field
            label="Owner's WhatsApp"
            name="ownerPhone"
            placeholder="10-digit mobile"
            inputMode="numeric"
            required
          />
        </div>
        <Field
          label="Staff PIN"
          hint="Used by shop staff to redeem coupons."
          name="pin"
          placeholder="4–6 digits"
          inputMode="numeric"
          required
          maxLength={6}
        />
      </Section>

      <Section
        step={2}
        title="The campaign"
        subtitle="What customers see when they scan."
      >
        <Field
          label="Campaign name"
          name="campaignName"
          placeholder="Onam Scratch & Win"
          defaultValue="Onam Scratch & Win"
          required
        />
        <Field
          label="Headline customers see"
          name="headline"
          defaultValue="Scratch & Win this Onam!"
          required
        />
        <Field
          label="Last day of campaign"
          name="endsAt"
          type="date"
          defaultValue={defaultEndDate()}
          required
        />
      </Section>

      <Section
        step={3}
        title="Prizes"
        subtitle="Keep the first prize as “everyone wins” — customers who win nothing don’t come back."
      >
        <div className="space-y-3">
          {prizes.map((p, i) => (
            <div
              key={i}
              className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500">
                  Prize {i + 1}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TIER_STYLES[p.tier]}`}
                >
                  {TIER_LABELS[p.tier]}
                </span>
              </div>
              <input
                name={`prize_name_${i}`}
                value={p.name}
                onChange={(e) => updatePrize(i, { name: e.target.value })}
                placeholder={i === prizes.length - 1 ? "Big prize (e.g. Kasavu Saree)" : "Prize name"}
                maxLength={60}
                aria-label={`Prize ${i + 1} name`}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none transition-shadow focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />
              <div className="mt-2 flex gap-2">
                <div className="w-28">
                  <input
                    name={`prize_qty_${i}`}
                    value={p.quantity}
                    onChange={(e) =>
                      updatePrize(i, { quantity: e.target.value.replace(/\D/g, "") })
                    }
                    inputMode="numeric"
                    aria-label={`Prize ${i + 1} quantity`}
                    placeholder="Qty"
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base tabular-nums outline-none transition-shadow focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                  />
                </div>
                <select
                  name={`prize_tier_${i}`}
                  value={p.tier}
                  onChange={(e) =>
                    updatePrize(i, { tier: e.target.value as PrizeRow["tier"] })
                  }
                  aria-label={`Prize ${i + 1} rarity`}
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none transition-shadow focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
                >
                  {(Object.keys(TIER_LABELS) as PrizeRow["tier"][]).map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
        {prizes.length < 8 && (
          <button
            type="button"
            onClick={() =>
              setPrizes((rows) => [...rows, { name: "", quantity: "10", tier: "common" }])
            }
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-300 py-3 text-sm font-medium text-neutral-600 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add another prize
          </button>
        )}
      </Section>

      {state.error && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
          {state.error}
        </p>
      )}

      <div className="sticky bottom-4 z-10 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:brightness-105 active:brightness-95 disabled:opacity-60 cursor-pointer"
        >
          {pending ? "Creating…" : "Create merchant & launch campaign"}
        </button>
      </div>
    </form>
  );
}

function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-xs font-bold text-white">
          {step}
        </span>
        <div>
          <h2 className="text-base font-semibold text-neutral-900">{title}</h2>
          <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  hint,
  ...rest
}: {
  label: string;
  name: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-neutral-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={rest.type ?? "text"}
        {...rest}
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base outline-none transition-shadow placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
      />
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}
