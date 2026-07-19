"use client";

/**
 * ShopifySyncPanel — the operational Sync Engine dashboard for `/m/shopify`.
 *
 * Renders connection health, per-resource sync state with live progress, recent
 * sync jobs (logs), and the manual/selective trigger. All
 * data flows through the `use-shopify` React Query hooks against
 * `/api/v1/shopify/sync*`; no direct fetch, no DB access, no tenant id sent. The
 * bundle self-polls while a job is running so progress ticks without a refresh.
 */

import { useMemo, useState } from "react";

import {
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Activity,
  Webhook,
  Users,
  Package,
  ShoppingBag,
  Layers,
  Boxes,
  Ticket,
  ChevronDown,
  History,
  Zap,
  Hand,
} from "lucide-react";
import {
  useShopifySync,
  useTriggerShopifySync,
} from "@/lib/api/hooks/use-shopify";
import type {
  ShopifyResourceSyncStateDTO,
  ShopifySyncJobDTO,
} from "@/lib/api/types";

const RESOURCE_META: Record<string, { label: string; icon: typeof Users; tone: string }> = {
  customers: { label: "Customers", icon: Users, tone: "bg-violet-50 text-violet-600" },
  products: { label: "Products", icon: Package, tone: "bg-blue-50 text-blue-600" },
  orders: { label: "Orders", icon: ShoppingBag, tone: "bg-amber-50 text-amber-600" },
  collections: { label: "Collections", icon: Layers, tone: "bg-indigo-50 text-indigo-600" },
  inventory: { label: "Inventory", icon: Boxes, tone: "bg-cyan-50 text-cyan-600" },
  discounts: { label: "Discounts", icon: Ticket, tone: "bg-rose-50 text-rose-600" },
};

const RESOURCES: Array<{ key: string; label: string; icon: typeof Users }> = [
  { key: "customers", label: "Customers", icon: Users },
  { key: "products", label: "Products", icon: Package },
  { key: "orders", label: "Orders", icon: ShoppingBag },
  { key: "collections", label: "Collections", icon: Layers },
  { key: "inventory", label: "Inventory", icon: Boxes },
  { key: "discounts", label: "Discounts", icon: Ticket },
];

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATUS_TONE: Record<string, { pill: string; border: string; dot: string }> = {
  completed: {
    pill: "bg-emerald-50 text-emerald-700 border-emerald-100",
    border: "border-l-emerald-500",
    dot: "bg-emerald-500",
  },
  running: {
    pill: "bg-blue-50 text-blue-700 border-blue-100",
    border: "border-l-blue-500",
    dot: "bg-blue-500",
  },
  queued: {
    pill: "bg-amber-50 text-amber-800 border-amber-100",
    border: "border-l-amber-400",
    dot: "bg-amber-400",
  },
  failed: {
    pill: "bg-red-50 text-red-700 border-red-100",
    border: "border-l-red-500",
    dot: "bg-red-500",
  },
  cancelled: {
    pill: "bg-neutral-100 text-neutral-500 border-neutral-200",
    border: "border-l-neutral-300",
    dot: "bg-neutral-400",
  },
};

export function ShopifySyncPanel() {
  const { data, isLoading, isError, refetch, isFetching } = useShopifySync();
  const trigger = useTriggerShopifySync();

  if (isLoading) return <PanelSkeleton />;
  if (isError || !data) {
    return (
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-500">
          Couldn&apos;t load sync status.
        </span>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-700 hover:text-neutral-900"
        >
          <RefreshCw className="size-3.5" /> Retry
        </button>
      </div>
    );
  }

  const { health, resources, recentJobs } = data;
  const stateByResource = new Map<string, ShopifyResourceSyncStateDTO>(
    resources.map((r) => [r.resource, r])
  );
  const busy = trigger.isPending || !!health.activeJob;

  return (
    <div className="space-y-6">
      {/* Health header + actions */}
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex items-center justify-center size-10 rounded-2xl shrink-0 ${
                health.connected ? "bg-emerald-50 text-emerald-600" : "bg-neutral-100 text-neutral-400"
              }`}
            >
              <Activity className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black text-neutral-900">Sync Engine</p>
              <p className="text-[11px] font-semibold text-neutral-500 mt-0.5 flex items-center gap-2">
                <Webhook className="size-3" />
                {health.webhooks24h.total} webhooks / 24h
                {health.webhooks24h.failed > 0 && (
                  <span className="text-red-500">· {health.webhooks24h.failed} failed</span>
                )}
                {isFetching && <Loader2 className="size-3 animate-spin text-emerald-500" />}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => trigger.mutate({ mode: "manual" })}
              disabled={busy}
              className="inline-flex items-center gap-2 bg-neutral-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {health.activeJob ? "Syncing…" : "Sync all now"}
            </button>
          </div>
        </div>

        {/* Active job progress */}
        {health.activeJob && (
          <div className="mt-4 rounded-2xl bg-blue-50/60 border border-blue-100 p-3">
            <div className="flex items-center justify-between text-[11px] font-bold text-blue-700">
              <span className="capitalize">{health.activeJob.resource} syncing</span>
              <span>
                {health.activeJob.processed.toLocaleString()}
                {health.activeJob.total ? ` / ${health.activeJob.total.toLocaleString()}` : ""}
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-blue-100 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: health.activeJob.total
                    ? `${Math.min(100, Math.round((health.activeJob.processed / health.activeJob.total) * 100))}%`
                    : "40%",
                }}
              />
            </div>
          </div>
        )}

        {health.lastError && !health.activeJob && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50/60 border border-red-100 p-3">
            <AlertTriangle className="size-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-[11px] font-semibold text-red-600 break-words">{health.lastError}</p>
          </div>
        )}
      </div>

      {/* Per-resource sync state */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {RESOURCES.map(({ key, label, icon: Icon }) => {
          const st = stateByResource.get(key);
          const running = health.activeJob?.resource === key;
          return (
            <div
              key={key}
              className="bg-white rounded-2xl border border-neutral-200/80 shadow-sm p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center size-8 rounded-xl bg-neutral-50 text-neutral-500">
                    <Icon className="size-4" />
                  </div>
                  <span className="text-xs font-black text-neutral-900">{label}</span>
                </div>
                <button
                  onClick={() => trigger.mutate({ resources: [key], mode: "manual" })}
                  disabled={trigger.isPending || running}
                  title={`Sync ${label.toLowerCase()}`}
                  className="text-neutral-400 hover:text-neutral-700 disabled:opacity-40 transition"
                >
                  <RefreshCw className={`size-3.5 ${running ? "animate-spin text-blue-500" : ""}`} />
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px]">
                <span className="inline-flex items-center gap-1 text-neutral-400 font-semibold">
                  <Clock className="size-3" />
                  {timeAgo(st?.lastSyncedAt ?? null)}
                </span>
                <StatusPill status={running ? "running" : st?.lastStatus ?? null} />
              </div>
              {st && st.totalSynced > 0 && (
                <p className="mt-1 text-[10px] font-semibold text-neutral-400">
                  {st.totalSynced.toLocaleString()} synced
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent jobs (logs) */}
      <RecentJobsPanel jobs={recentJobs} />
    </div>
  );
}

type JobFilter = "all" | "active" | "done" | "failed";

function RecentJobsPanel({ jobs }: { jobs: ShopifySyncJobDTO[] }) {
  const [filter, setFilter] = useState<JobFilter>("all");
  const [expanded, setExpanded] = useState(false);

  const counts = useMemo(
    () => ({
      active: jobs.filter((j) => j.status === "queued" || j.status === "running").length,
      done: jobs.filter((j) => j.status === "completed").length,
      failed: jobs.filter((j) => j.status === "failed").length,
    }),
    [jobs]
  );

  const filtered = useMemo(() => {
    const list =
      filter === "active"
        ? jobs.filter((j) => j.status === "queued" || j.status === "running")
        : filter === "done"
          ? jobs.filter((j) => j.status === "completed")
          : filter === "failed"
            ? jobs.filter((j) => j.status === "failed")
            : jobs;
    return [...list].sort((a, b) => {
      const rank = (s: string) =>
        s === "running" ? 0 : s === "queued" ? 1 : s === "failed" ? 2 : 3;
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus !== 0) return byStatus;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [jobs, filter]);

  const visible = expanded ? filtered : filtered.slice(0, 8);
  const hidden = filtered.length - visible.length;

  const tabs: Array<{ id: JobFilter; label: string; count?: number }> = [
    { id: "all", label: "All", count: jobs.length },
    { id: "active", label: "Active", count: counts.active },
    { id: "done", label: "Completed", count: counts.done },
    { id: "failed", label: "Failed", count: counts.failed },
  ];

  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-neutral-50/80 via-white to-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600">
              <History className="size-4" />
            </div>
            <div>
              <p className="text-sm font-black text-neutral-900">Recent sync jobs</p>
              <p className="text-[11px] font-medium text-neutral-500">
                Latest imports from your Shopify store
              </p>
            </div>
          </div>
          {jobs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setFilter(tab.id);
                    setExpanded(false);
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${
                    filter === tab.id
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                  }`}
                >
                  {tab.label}
                  {tab.count != null && tab.count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-px text-[9px] ${
                        filter === tab.id ? "bg-white/20" : "bg-white"
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
            <RefreshCw className="size-5" />
          </div>
          <p className="mt-3 text-sm font-bold text-neutral-600">No sync jobs yet</p>
          <p className="text-xs font-medium text-neutral-400 mt-1">
            Hit &quot;Sync all now&quot; above to import your store data.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-10 text-center text-xs font-semibold text-neutral-400">
          No {filter === "all" ? "" : filter} jobs in this view.
        </p>
      ) : (
        <>
          <ul className="p-3 space-y-2">
            {visible.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
          {hidden > 0 && (
            <div className="px-5 pb-4">
              <button
                onClick={() => setExpanded(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 text-xs font-bold text-neutral-600 hover:bg-neutral-100 transition"
              >
                Show {hidden} more
                <ChevronDown className="size-4" />
              </button>
            </div>
          )}
          {expanded && filtered.length > 8 && (
            <div className="px-5 pb-4">
              <button
                onClick={() => setExpanded(false)}
                className="w-full text-xs font-bold text-neutral-400 hover:text-neutral-600"
              >
                Show less
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-neutral-300 font-semibold text-xs">—</span>;
  const tone = STATUS_TONE[status] ?? STATUS_TONE.cancelled;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold shrink-0 ${tone.pill}`}
    >
      {status === "completed" && <CheckCircle2 className="size-3" />}
      {status === "running" && <Loader2 className="size-3 animate-spin" />}
      {status === "queued" && <Clock className="size-3" />}
      {status === "failed" && <AlertTriangle className="size-3" />}
      <span className="capitalize">{status}</span>
    </span>
  );
}

function JobRow({ job }: { job: ShopifySyncJobDTO }) {
  const meta = RESOURCE_META[job.resource] ?? {
    label: job.resource,
    icon: Package,
    tone: "bg-neutral-50 text-neutral-600",
  };
  const Icon = meta.icon;
  const tone = STATUS_TONE[job.status] ?? STATUS_TONE.cancelled;
  const ModeIcon = job.mode === "manual" ? Hand : Zap;
  const progressPct =
    job.total && job.total > 0
      ? Math.min(100, Math.round((job.processed / job.total) * 100))
      : null;

  return (
    <li
      className={`rounded-xl border border-neutral-100 bg-white border-l-[3px] ${tone.border} overflow-hidden`}
    >
      <div className="flex items-start gap-3 p-3 sm:p-3.5">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}
        >
          <Icon className="size-4.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-neutral-900 capitalize">{meta.label}</p>
            <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 capitalize">
              <ModeIcon className="size-2.5" />
              {job.mode}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-neutral-500">
            <span>
              <strong className="text-neutral-800">{job.processed.toLocaleString()}</strong> processed
            </span>
            {job.failed > 0 && (
              <span className="text-red-600 font-bold">{job.failed} failed</span>
            )}
            {job.durationMs != null && (
              <span>{(job.durationMs / 1000).toFixed(1)}s</span>
            )}
            <span className="inline-flex items-center gap-1 text-neutral-400">
              <Clock className="size-3" />
              {timeAgo(job.createdAt)}
            </span>
          </div>

          {(job.status === "running" || job.status === "queued") && progressPct != null && (
            <div className="mt-2.5">
              <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    job.status === "running" ? "bg-blue-500" : "bg-amber-400"
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {job.error && (
            <p className="mt-2 text-[11px] font-medium text-red-600 leading-relaxed line-clamp-2">
              {job.error}
            </p>
          )}
        </div>

        <StatusPill status={job.status} />
      </div>
    </li>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-24 bg-neutral-100 rounded-3xl animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 bg-neutral-100 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="h-40 bg-neutral-100 rounded-3xl animate-pulse" />
    </div>
  );
}
