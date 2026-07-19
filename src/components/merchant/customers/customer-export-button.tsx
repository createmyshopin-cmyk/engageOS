"use client";

import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import {
  exportCustomers,
  type CustomerExportFormat,
  type CustomerListFilters,
} from "@/lib/api/hooks/use-customers";
import {
  daysAgoIso,
  joinedLabel,
  joinedValueToApi,
  todayIso,
  type JoinedDateValue,
} from "@/components/merchant/customers/customer-date-filter";

export type ExportRangeMode = "current" | "all" | "7d" | "30d" | "custom";

const RANGE_OPTIONS: { value: ExportRangeMode; label: string; hint: string }[] = [
  { value: "current", label: "Current view", hint: "Matches filters on screen" },
  { value: "all", label: "All time", hint: "Every campaign customer" },
  { value: "7d", label: "Last 7 days", hint: "Joined in the past week" },
  { value: "30d", label: "Last 30 days", hint: "Joined in the past month" },
  { value: "custom", label: "Custom range", hint: "Pick start & end dates" },
];

function buildExportFilters(
  base: Pick<CustomerListFilters, "search" | "rewardFilter">,
  mode: ExportRangeMode,
  currentJoined: JoinedDateValue,
  customFrom: string,
  customTo: string
): CustomerListFilters {
  const baseFilters: CustomerListFilters = {
    search: base.search,
    rewardFilter: base.rewardFilter,
  };

  if (mode === "current") {
    const joinedApi = joinedValueToApi(currentJoined);
    return {
      ...baseFilters,
      joined: joinedApi.joined,
      joinedFrom: joinedApi.joinedFrom ?? null,
      joinedTo: joinedApi.joinedTo ?? null,
    };
  }

  if (mode === "all") {
    return { ...baseFilters, joined: "all", joinedFrom: null, joinedTo: null };
  }

  if (mode === "7d") {
    return { ...baseFilters, joined: "7d", joinedFrom: null, joinedTo: null };
  }

  if (mode === "30d") {
    return { ...baseFilters, joined: "30d", joinedFrom: null, joinedTo: null };
  }

  return {
    ...baseFilters,
    joined: "all",
    joinedFrom: customFrom || null,
    joinedTo: customTo || null,
  };
}

function rangeSummary(
  mode: ExportRangeMode,
  currentJoined: JoinedDateValue,
  customFrom: string,
  customTo: string
): string {
  switch (mode) {
    case "current":
      return currentJoined.preset === "all" ? "All dates" : joinedLabel(currentJoined);
    case "all":
      return "All dates";
    case "7d":
      return "Last 7 days";
    case "30d":
      return "Last 30 days";
    case "custom":
      if (customFrom && customTo) {
        return `${formatShort(customFrom)} – ${formatShort(customTo)}`;
      }
      return "Select dates below";
  }
}

function formatShort(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CustomerExportButton({
  baseFilters,
  currentJoined,
  disabled = false,
  customerCount,
  hasMore,
}: {
  baseFilters: Pick<CustomerListFilters, "search" | "rewardFilter">;
  currentJoined: JoinedDateValue;
  disabled?: boolean;
  customerCount?: number;
  hasMore?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ExportRangeMode>("current");
  const [customFrom, setCustomFrom] = useState(daysAgoIso(30));
  const [customTo, setCustomTo] = useState(todayIso());
  const [exporting, setExporting] = useState<CustomerExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const customValid = mode !== "custom" || (!!customFrom && !!customTo && customFrom <= customTo);
  const canExport = !disabled && exporting === null && customValid;

  async function runExport(format: CustomerExportFormat) {
    if (!canExport) return;
    setError(null);
    setExporting(format);
    try {
      const filters = buildExportFilters(baseFilters, mode, currentJoined, customFrom, customTo);
      await exportCustomers(filters, format);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  const countHint =
    mode === "current" && customerCount != null && customerCount > 0
      ? `${customerCount}${hasMore ? "+" : ""} in view`
      : null;

  return (
    <div className="relative shrink-0" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || exporting !== null}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center justify-center gap-2 pl-4 pr-3 py-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-bold text-neutral-700 hover:bg-neutral-50 hover:border-emerald-300 hover:text-emerald-800 disabled:opacity-50 transition shadow-sm"
      >
        {exporting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Download className="size-3.5" />
        )}
        Export
        <ChevronDown className={`size-3.5 text-neutral-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Export customers"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(100vw-2rem,22rem)] rounded-2xl border border-neutral-200 bg-white shadow-xl shadow-neutral-900/10 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div className="px-4 pt-4 pb-3 border-b border-neutral-100 bg-gradient-to-b from-neutral-50/80 to-white">
            <p className="text-xs font-black text-neutral-900">Export customers</p>
            <p className="text-[10px] text-neutral-500 mt-0.5 font-medium">
              Choose a date range. Search & reward filters still apply.
            </p>
          </div>

          <div className="p-3 space-y-1.5 max-h-[min(60vh,20rem)] overflow-y-auto">
            {RANGE_OPTIONS.map((opt) => {
              const active = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={`w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    active
                      ? "bg-emerald-50 ring-1 ring-emerald-200"
                      : "hover:bg-neutral-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 size-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      active ? "border-emerald-600" : "border-neutral-300"
                    }`}
                  >
                    {active && <span className="size-2 rounded-full bg-emerald-600" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-neutral-900">{opt.label}</span>
                      {opt.value === "current" && countHint && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                          {countHint}
                        </span>
                      )}
                    </span>
                    <span className="block text-[10px] text-neutral-500 font-medium mt-0.5">
                      {opt.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {mode === "custom" && (
            <div className="px-3 pb-3 space-y-3">
              <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomFrom(daysAgoIso(7));
                      setCustomTo(todayIso());
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-[10px] font-bold text-neutral-600 hover:border-emerald-300 hover:text-emerald-700 transition"
                  >
                    Last 7 days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomFrom(daysAgoIso(30));
                      setCustomTo(todayIso());
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white border border-neutral-200 text-[10px] font-bold text-neutral-600 hover:border-emerald-300 hover:text-emerald-700 transition"
                  >
                    Last 30 days
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ExportDateField
                    label="From"
                    value={customFrom}
                    max={customTo || todayIso()}
                    onChange={setCustomFrom}
                  />
                  <ExportDateField
                    label="To"
                    value={customTo}
                    min={customFrom}
                    max={todayIso()}
                    onChange={setCustomTo}
                  />
                </div>
                {customFrom && customTo && customFrom > customTo && (
                  <p className="text-[10px] font-semibold text-red-600">
                    Start date must be before end date.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="px-3 pb-3 pt-1 space-y-2 border-t border-neutral-100 bg-neutral-50/50">
            <div className="flex items-center gap-2 px-1 py-1">
              <SlidersHorizontal className="size-3 text-neutral-400 shrink-0" />
              <p className="text-[10px] font-semibold text-neutral-500">
                Date:{" "}
                <span className="text-neutral-800">
                  {rangeSummary(mode, currentJoined, customFrom, customTo)}
                </span>
              </p>
            </div>

            {error && (
              <p className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                {error}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => runExport("csv")}
                disabled={!canExport}
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-neutral-200 bg-white text-xs font-bold text-neutral-800 hover:border-emerald-300 hover:text-emerald-800 disabled:opacity-50 transition"
              >
                {exporting === "csv" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                CSV
              </button>
              <button
                type="button"
                onClick={() => runExport("xlsx")}
                disabled={!canExport}
                className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 disabled:opacity-50 transition"
              >
                {exporting === "xlsx" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="size-3.5" />
                )}
                Excel
              </button>
            </div>
            <p className="text-[9px] font-medium text-neutral-400 px-1 leading-relaxed">
              Phones export as 10-digit Mobile, +91 E.164, and WhatsApp-ready 91… columns.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportDateField({
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
      <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">{label}</span>
      <div className="relative">
        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-neutral-400 pointer-events-none" />
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-8 pr-2 py-2 text-[11px] font-semibold text-neutral-900 bg-white border border-neutral-200 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition [color-scheme:light]"
        />
      </div>
    </label>
  );
}
