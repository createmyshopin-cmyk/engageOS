"use client";

import { useEffect, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";

export type JoinedPreset = "all" | "7d" | "30d" | "90d" | "custom";

export interface JoinedDateValue {
  preset: JoinedPreset;
  from: string;
  to: string;
}

const PRESETS: { value: JoinedPreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "custom", label: "Custom" },
];

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  return d.toISOString().slice(0, 10);
}

export function joinedValueToApi(value: JoinedDateValue): {
  joined?: "7d" | "30d" | "90d";
  joinedFrom?: string;
  joinedTo?: string;
} {
  if (value.preset === "custom") {
    if (!value.from && !value.to) return {};
    return {
      joinedFrom: value.from || undefined,
      joinedTo: value.to || undefined,
    };
  }
  if (value.preset === "all") return {};
  return { joined: value.preset };
}

export function joinedLabel(value: JoinedDateValue): string {
  if (value.preset === "custom") {
    if (value.from && value.to) {
      return `${formatShort(value.from)} – ${formatShort(value.to)}`;
    }
    if (value.from) return `From ${formatShort(value.from)}`;
    if (value.to) return `Until ${formatShort(value.to)}`;
    return "Custom range";
  }
  return PRESETS.find((p) => p.value === value.preset)?.label ?? "All time";
}

function formatShort(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CustomerDateFilter({
  value,
  onChange,
}: {
  value: JoinedDateValue;
  onChange: (value: JoinedDateValue) => void;
}) {
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);

  useEffect(() => {
    setDraftFrom(value.from);
    setDraftTo(value.to);
  }, [value.from, value.to]);

  const showCustom = value.preset === "custom";

  function selectPreset(preset: JoinedPreset) {
    if (preset === "custom") {
      onChange({
        preset: "custom",
        from: value.from || daysAgoIso(30),
        to: value.to || todayIso(),
      });
      return;
    }
    onChange({ preset, from: "", to: "" });
  }

  function applyQuickRange(days: number) {
    onChange({
      preset: "custom",
      from: daysAgoIso(days),
      to: todayIso(),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
          <Calendar className="size-3.5" />
        </div>
        <span className="text-[11px] font-bold text-neutral-700">Joined date</span>
      </div>

      <div className="flex flex-wrap gap-1.5 p-1 bg-neutral-100/80 rounded-xl">
        {PRESETS.map((p) => {
          const active = value.preset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => selectPreset(p.value)}
              className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-[11px] font-bold transition-all ${
                active
                  ? "bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-200/80"
                  : "text-neutral-500 hover:text-neutral-700 hover:bg-white/50"
              }`}
            >
              {p.label}
              {p.value === "custom" && (
                <ChevronDown className={`size-3 transition ${showCustom ? "rotate-180" : ""}`} />
              )}
            </button>
          );
        })}
      </div>

      {showCustom && (
        <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyQuickRange(7)}
              className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-[10px] font-bold text-neutral-600 hover:border-emerald-300 hover:text-emerald-700 transition"
            >
              Last 7 days
            </button>
            <button
              type="button"
              onClick={() => applyQuickRange(30)}
              className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-[10px] font-bold text-neutral-600 hover:border-emerald-300 hover:text-emerald-700 transition"
            >
              Last 30 days
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <DateField
              label="From"
              value={draftFrom}
              max={draftTo || todayIso()}
              onChange={(from) => {
                setDraftFrom(from);
                onChange({ preset: "custom", from, to: draftTo });
              }}
            />
            <DateField
              label="To"
              value={draftTo}
              min={draftFrom}
              max={todayIso()}
              onChange={(to) => {
                setDraftTo(to);
                onChange({ preset: "custom", from: draftFrom, to });
              }}
            />
          </div>

          <p className="text-[10px] text-neutral-400 font-medium">
            Pick a start and end date, or use a quick range above.
          </p>
        </div>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{label}</span>
      <div className="relative">
        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400 pointer-events-none" />
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 text-sm font-semibold text-neutral-900 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition [color-scheme:light]"
        />
      </div>
    </label>
  );
}
