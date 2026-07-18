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
} from "lucide-react";
import {
  useShopifySync,
  useTriggerShopifySync,
} from "@/lib/api/hooks/use-shopify";
import type {
  ShopifyResourceSyncStateDTO,
  ShopifySyncJobDTO,
} from "@/lib/api/types";

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

const STATUS_TONE: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700",
  running: "bg-blue-50 text-blue-700",
  queued: "bg-amber-50 text-amber-700",
  failed: "bg-red-50 text-red-700",
  cancelled: "bg-neutral-100 text-neutral-500",
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
      <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-neutral-100">
          <p className="text-xs font-black text-neutral-900">Recent sync jobs</p>
        </div>
        {recentJobs.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs font-semibold text-neutral-400">
            No sync jobs yet. Trigger a sync to get started.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-50">
            {recentJobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-neutral-300 font-semibold">—</span>;
  const tone = STATUS_TONE[status] ?? "bg-neutral-100 text-neutral-500";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${tone}`}>
      {status === "completed" && <CheckCircle2 className="size-3" />}
      {status === "running" && <Loader2 className="size-3 animate-spin" />}
      {status === "failed" && <AlertTriangle className="size-3" />}
      <span className="capitalize">{status}</span>
    </span>
  );
}

function JobRow({ job }: { job: ShopifySyncJobDTO }) {
  return (
    <li className="px-5 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-neutral-800 capitalize truncate">
          {job.resource} <span className="text-neutral-300 font-medium">· {job.mode}</span>
        </p>
        <p className="text-[10px] font-semibold text-neutral-400 mt-0.5">
          {job.processed.toLocaleString()} processed
          {job.failed > 0 && <span className="text-red-400"> · {job.failed} failed</span>}
          {job.durationMs != null && <> · {(job.durationMs / 1000).toFixed(1)}s</>}
          <> · {timeAgo(job.createdAt)}</>
        </p>
        {job.error && (
          <p className="text-[10px] font-semibold text-red-500 mt-0.5 truncate max-w-md">
            {job.error}
          </p>
        )}
      </div>
      <StatusPill status={job.status} />
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
