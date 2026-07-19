"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CampaignStatus } from "@/lib/types";

const STATUSES: { value: CampaignStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const DATE_RANGES = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
] as const;

type DateRange = (typeof DATE_RANGES)[number]["value"];

export function CampaignsFilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQuery(searchParams.get("q") ?? "");
  }, [searchParams]);

  const pushFilters = useCallback(
    (next: { q?: string; status?: string; range?: string }) => {
      const params = new URLSearchParams(searchParams.toString());

      const apply = (key: string, value: string | undefined) => {
        if (value) params.set(key, value);
        else params.delete(key);
      };

      if ("q" in next) apply("q", next.q?.trim() || undefined);
      if ("status" in next) apply("status", next.status || undefined);
      if ("range" in next) apply("range", next.range || undefined);

      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `/m/campaigns?${qs}` : "/m/campaigns", { scroll: false });
      });
    },
    [router, searchParams]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (query.trim() === current.trim()) return;
      pushFilters({ q: query });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, pushFilters, searchParams]);

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <div className="relative flex-1 min-w-[200px]">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search campaigns..."
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>

      <select
        value={searchParams.get("status") ?? ""}
        onChange={(e) => pushFilters({ status: e.target.value })}
        className="px-4 py-2.5 text-sm bg-white border border-neutral-200 rounded-xl text-neutral-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
      >
        <option value="">Status: All</option>
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        value={searchParams.get("range") ?? ""}
        onChange={(e) => pushFilters({ range: e.target.value as DateRange | "" })}
        className="px-4 py-2.5 text-sm bg-white border border-neutral-200 rounded-xl text-neutral-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
      >
        <option value="">Date: All Time</option>
        {DATE_RANGES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  );
}
