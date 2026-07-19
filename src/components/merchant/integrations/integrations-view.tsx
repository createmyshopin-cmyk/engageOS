"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Blocks,
  CheckCircle2,
  Clock,
  Plug,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export type IntegrationStatus = "connected" | "disconnected" | "coming_soon";

export interface IntegrationCardData {
  id: string;
  name: string;
  description: string;
  logoSrc: string;
  logoClassName?: string;
  category: string;
  status: IntegrationStatus;
  href: string;
  badgeLabel: string;
  accountName: string | null;
}

export interface IntegrationSectionData {
  id: string;
  title: string;
  subtitle: string;
  items: IntegrationCardData[];
}

type FilterKey = "all" | "connected" | "available" | "coming_soon";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "connected", label: "Connected" },
  { key: "available", label: "Available" },
  { key: "coming_soon", label: "Coming soon" },
];

function matchesFilter(status: IntegrationStatus, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "connected") return status === "connected";
  if (filter === "available") return status === "disconnected";
  return status === "coming_soon";
}

export function IntegrationsView({ sections }: { sections: IntegrationSectionData[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const allItems = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections]
  );

  const stats = useMemo(
    () => ({
      connected: allItems.filter((i) => i.status === "connected").length,
      available: allItems.filter((i) => i.status === "disconnected").length,
      comingSoon: allItems.filter((i) => i.status === "coming_soon").length,
    }),
    [allItems]
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const matchesSearch =
            normalizedQuery.length === 0 ||
            item.name.toLowerCase().includes(normalizedQuery) ||
            item.description.toLowerCase().includes(normalizedQuery) ||
            section.title.toLowerCase().includes(normalizedQuery);
          return matchesSearch && matchesFilter(item.status, filter);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, normalizedQuery, filter]);

  const connectedItems = allItems.filter((i) => i.status === "connected");
  const resultCount = filteredSections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="space-y-8">
      <header className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center size-11 rounded-2xl bg-[#F0FDF4] border border-[#DCFCE7] shadow-sm">
              <Blocks className="size-5 text-[#16A34A]" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-[#111827] tracking-tight">Integrations</h1>
              <p className="mt-0.5 text-xs text-[#6B7280] font-medium max-w-xl">
                Connect marketing pixels, messaging channels, reporting tools, and your store to
                EngageOS.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Connected"
            value={stats.connected}
            icon={CheckCircle2}
            tone="emerald"
          />
          <StatCard label="Available" value={stats.available} icon={Plug} tone="neutral" />
          <StatCard label="Coming soon" value={stats.comingSoon} icon={Clock} tone="amber" />
        </div>

        {connectedItems.length > 0 && filter === "all" && normalizedQuery.length === 0 && (
          <div className="rounded-2xl border border-[#BBF7D0] bg-gradient-to-r from-[#F0FDF4] to-white p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#15803D]">
              <Sparkles className="size-3.5" />
              Active connections
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {connectedItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="inline-flex items-center gap-2 rounded-full border border-[#BBF7D0] bg-white px-3 py-1.5 text-[11px] font-bold text-[#166534] shadow-sm transition-colors hover:bg-[#F0FDF4]"
                >
                  <IntegrationLogo item={item} size="sm" />
                  <span>{item.name}</span>
                  <ArrowRight className="size-3 opacity-60" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations…"
            className="w-full rounded-2xl border border-[#E5E7EB] bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-[#111827] placeholder:text-[#9CA3AF] shadow-sm focus:border-[#86EFAC] focus:outline-none focus:ring-2 focus:ring-[#DCFCE7]"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const active = filter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold transition-all ${
                  active
                    ? "bg-[#111827] text-white shadow-sm"
                    : "border border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#D1D5DB] hover:text-[#111827]"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {filteredSections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D1D5DB] bg-neutral-50 px-6 py-12 text-center">
          <p className="text-sm font-black text-[#111827]">No integrations match</p>
          <p className="mt-1 text-xs font-medium text-[#6B7280]">
            Try a different search term or filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
            className="mt-4 inline-flex items-center rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#111827] border border-[#E5E7EB] hover:bg-neutral-50"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {filteredSections.map((section) => (
            <IntegrationSection key={section.id} section={section} />
          ))}
        </div>
      )}

      {(normalizedQuery.length > 0 || filter !== "all") && (
        <p className="text-center text-[11px] font-medium text-[#9CA3AF]">
          Showing {resultCount} integration{resultCount === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof CheckCircle2;
  tone: "emerald" | "neutral" | "amber";
}) {
  const styles = {
    emerald: {
      card: "border-[#BBF7D0] bg-[#F0FDF4]",
      icon: "bg-[#DCFCE7] text-[#16A34A]",
    },
    neutral: {
      card: "border-[#E5E7EB] bg-white",
      icon: "bg-neutral-100 text-[#6B7280]",
    },
    amber: {
      card: "border-[#FDE68A] bg-[#FFFBEB]",
      icon: "bg-amber-100 text-[#D97706]",
    },
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${styles.card}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-[#6B7280]">
          {label}
        </span>
        <div className={`flex items-center justify-center size-8 rounded-xl ${styles.icon}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-2 text-3xl font-black leading-none text-[#111827]">{value}</p>
    </div>
  );
}

function IntegrationSection({ section }: { section: IntegrationSectionData }) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-[#111827]">
            {section.title}
          </h2>
          <p className="mt-0.5 text-xs text-[#6B7280] font-medium">{section.subtitle}</p>
        </div>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[10px] font-black text-neutral-500">
          {section.items.length}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {section.items.map((item) => (
          <IntegrationCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function IntegrationLogo({
  item,
  size = "md",
}: {
  item: IntegrationCardData;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-5" : "size-12";
  const img = item.logoClassName ?? (size === "sm" ? "size-5 object-contain" : "size-9 object-contain");

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#F3F4F6] bg-neutral-50 ${box}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local assets and official brand CDN logos */}
      <img src={item.logoSrc} alt="" className={img} />
    </div>
  );
}

function IntegrationCard({ item }: { item: IntegrationCardData }) {
  const isConnected = item.status === "connected";
  const isDisconnected = item.status === "disconnected";
  const isComingSoon = item.status === "coming_soon";

  const cardClass = [
    "group flex h-full flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm transition-all duration-200",
    isConnected
      ? "border-[#BBF7D0] hover:border-[#86EFAC] hover:shadow-md"
      : isComingSoon
        ? "border-dashed border-[#E5E7EB] bg-neutral-50/80 opacity-90"
        : "border-[#E5E7EB] hover:border-[#D1D5DB] hover:shadow-md hover:-translate-y-0.5",
  ].join(" ");

  const content = (
    <>
      <div>
        <div className="flex items-start justify-between gap-3">
          <IntegrationLogo item={item} />
          <StatusBadge item={item} />
        </div>

        <h3 className="mt-4 text-sm font-black text-[#111827] group-hover:text-[#15803D] transition-colors">
          {item.name}
        </h3>
        <p className="mt-2 line-clamp-3 text-xs text-[#6B7280] font-medium leading-relaxed">
          {item.description}
        </p>

        {isConnected && item.accountName && (
          <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] px-3 py-2">
            <ShieldCheck className="size-4 shrink-0 text-[#16A34A]" />
            <span className="text-[10px] font-bold text-[#166534] truncate">{item.accountName}</span>
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-[#F3F4F6]">
        {isConnected ? (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#16A34A] group-hover:text-[#15803D]">
            Configure settings
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        ) : isDisconnected ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors group-hover:bg-[#15803D]">
            <Plug className="size-3.5" />
            Connect
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-400">
            <Clock className="size-3.5" />
            Coming soon
          </span>
        )}
      </div>
    </>
  );

  if (isComingSoon) {
    return <article className={cardClass}>{content}</article>;
  }

  return (
    <Link href={item.href} className={cardClass}>
      {content}
    </Link>
  );
}

function StatusBadge({ item }: { item: IntegrationCardData }) {
  const isConnected = item.status === "connected";
  const isDisconnected = item.status === "disconnected";

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
        isConnected
          ? "bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0]"
          : isDisconnected
            ? "bg-neutral-50 text-neutral-600 border border-neutral-200"
            : "bg-amber-50 text-amber-600 border border-amber-200"
      }`}
    >
      {isConnected && <span className="size-1.5 rounded-full bg-[#16A34A] animate-pulse" />}
      {item.badgeLabel}
    </span>
  );
}
