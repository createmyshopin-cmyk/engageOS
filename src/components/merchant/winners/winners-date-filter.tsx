"use client";

import { Calendar, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import {
  addIstDays,
  todayIstDate,
  yesterdayIstDate,
} from "@/lib/merchant/ist-date";

export type WonDatePreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "all" | "custom";

export interface WonDateValue {
  preset: WonDatePreset;
  from: string;
  to: string;
}

const PRESETS: { value: WonDatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

export function todayIso(): string {
  return todayIstDate();
}

export function yesterdayIso(): string {
  return yesterdayIstDate();
}

export function wonDateLabel(value: WonDateValue): string {
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

export function wonDateToApi(value: WonDateValue): { wonFrom: string | null; wonTo: string | null } {
  if (value.preset === "custom") {
    return {
      wonFrom: value.from || null,
      wonTo: value.to || null,
    };
  }
  const today = todayIstDate();
  if (value.preset === "today") {
    return { wonFrom: today, wonTo: today };
  }
  if (value.preset === "yesterday") {
    const yesterday = yesterdayIstDate();
    return { wonFrom: yesterday, wonTo: yesterday };
  }
  if (value.preset === "7d") {
    return { wonFrom: addIstDays(today, -6), wonTo: today };
  }
  if (value.preset === "30d") {
    return { wonFrom: addIstDays(today, -29), wonTo: today };
  }
  if (value.preset === "90d") {
    return { wonFrom: addIstDays(today, -89), wonTo: today };
  }
  return { wonFrom: null, wonTo: null };
}

export function WinnersDateFilter({
  value,
  onChange,
}: {
  value: WonDateValue;
  onChange: (value: WonDateValue) => void;
}) {
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);
  const showCustom = value.preset === "custom";

  useEffect(() => {
    setDraftFrom(value.from);
    setDraftTo(value.to);
  }, [value.from, value.to]);

  function selectPreset(preset: WonDatePreset) {
    if (preset === "custom") {
      onChange({
        preset: "custom",
        from: value.from || yesterdayIstDate(),
        to: value.to || todayIstDate(),
      });
      return;
    }
    onChange({ preset, from: "", to: "" });
  }

  return (
    <div className="min-w-[200px]">
      <div className="flex flex-wrap gap-1 p-1 bg-neutral-100/80 rounded-xl">
        {PRESETS.map((p) => {
          const active = value.preset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => selectPreset(p.value)}
              className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-[11px] font-bold transition-all ${
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
        <div className="mt-2 rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-3 grid grid-cols-2 gap-2">
          <DateField
            label="From"
            value={draftFrom}
            max={draftTo || todayIstDate()}
            onChange={(from) => {
              setDraftFrom(from);
              onChange({ preset: "custom", from, to: draftTo });
            }}
          />
          <DateField
            label="To"
            value={draftTo}
            min={draftFrom}
            max={todayIstDate()}
            onChange={(to) => {
              setDraftTo(to);
              onChange({ preset: "custom", from: draftFrom, to });
            }}
          />
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
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{label}</span>
      <div className="relative">
        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-neutral-400 pointer-events-none" />
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-8 pr-2 py-2 text-xs font-semibold bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 [color-scheme:light]"
        />
      </div>
    </label>
  );
}
