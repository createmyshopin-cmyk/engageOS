"use client";

/**
 * ShopifyView — the merchant's Shopify surface for `/m/shopify`.
 *
 * Two states, driven by the read-model overview (`/api/v1/shopify/overview`):
 *   - DISCONNECTED → a connect form that normalizes a `*.myshopify.com` domain
 *     and navigates to `/api/shopify/install` (top-level nav → Shopify OAuth).
 *   - CONNECTED → ingestion totals + the operational Sync Engine dashboard
 *     (`ShopifySyncPanel`), plus a disconnect control inside the panel.
 *
 * All data flows through the `use-shopify` React Query hooks; no direct fetch,
 * no DB access, no tenant id sent (the v1 guard derives it from the session).
 * The OAuth install is a browser navigation, never a mutation, so tokens are
 * never handled client-side.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Store,
  ShoppingBag,
  Package,
  IndianRupee,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Loader2,
  ArrowRight,
  X,
} from "lucide-react";
import { useShopifyOverview } from "@/lib/api/hooks/use-shopify";
import { ShopifySyncPanel } from "./shopify-sync-panel";

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** Accept `mystore` or `mystore.myshopify.com`; return a normalized domain or null. */
function normalizeShopInput(raw: string): string | null {
  let v = raw.trim().toLowerCase();
  if (!v) return null;
  // Strip a pasted URL down to its host.
  v = v.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!v.includes(".")) v = `${v}.myshopify.com`;
  return SHOP_DOMAIN_RE.test(v) ? v : null;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function ShopifyView() {
  const { data, isLoading, isError, error, refetch, isFetching } = useShopifyOverview();
  const params = useSearchParams();
  const justConnected = params.get("connected") === "1";
  const urlError = params.get("shopify_error");
  const [dismissed, setDismissed] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-neutral-900 tracking-tight">Shopify</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Sync customers, products, orders, collections, inventory and discounts from your store.
          </p>
        </div>
        {isFetching && (
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-neutral-400">
            <Loader2 className="size-3.5 animate-spin text-emerald-500" /> Refreshing…
          </span>
        )}
      </header>

      {/* URL-param banners (from the OAuth callback / install redirects) */}
      {!dismissed && justConnected && (
        <Banner
          tone="success"
          text="Store connected. Your first sync is starting — data will appear shortly."
          onClose={() => setDismissed(true)}
        />
      )}
      {!dismissed && urlError && (
        <Banner tone="error" text={urlError} onClose={() => setDismissed(true)} />
      )}

      {isLoading ? (
        <OverviewSkeleton />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "Failed to load Shopify data."}
          onRetry={refetch}
        />
      ) : (
        <>
          {/* Connection banner */}
          <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-5 flex items-center gap-4">
            <div
              className={`flex items-center justify-center size-12 rounded-2xl shrink-0 ${
                data?.connected ? "bg-emerald-50 text-emerald-600" : "bg-neutral-100 text-neutral-400"
              }`}
            >
              <Store className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              {data?.shop ? (
                <>
                  <p className="text-sm font-black text-neutral-900 truncate">{data.shop.domain}</p>
                  <p className="text-[11px] font-semibold text-neutral-500 mt-0.5">
                    Installed {formatDate(data.shop.installedAt)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-black text-neutral-900">No store connected</p>
                  <p className="text-[11px] font-semibold text-neutral-500 mt-0.5">
                    Enter your Shopify domain below to connect and start syncing.
                  </p>
                </>
              )}
            </div>
            {data?.connected && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="size-3.5" /> Active
              </span>
            )}
          </div>

          {data?.connected ? (
            <>
              {/* Totals */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  icon={ShoppingBag}
                  label="Orders ingested"
                  value={String(data?.totals.orders ?? 0)}
                  tone="bg-blue-50 text-blue-600"
                  href="/m/orders"
                />
                <StatCard
                  icon={Package}
                  label="Products synced"
                  value={String(data?.totals.products ?? 0)}
                  tone="bg-violet-50 text-violet-600"
                  href="/m/products"
                />
                <StatCard
                  icon={IndianRupee}
                  label="Total revenue"
                  value={formatMoney(data?.totals.revenue ?? 0)}
                  tone="bg-emerald-50 text-emerald-600"
                  sub={data?.lastOrderAt ? `Last order ${formatDate(data.lastOrderAt)}` : undefined}
                />
              </div>

              {/* Operational sync engine dashboard */}
              <ShopifySyncPanel />
            </>
          ) : (
            <ConnectForm />
          )}
        </>
      )}
    </div>
  );
}

function ConnectForm() {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const normalized = useMemo(() => normalizeShopInput(value), [value]);
  const showError = value.trim().length > 0 && !normalized;

  function connect() {
    if (!normalized) return;
    setSubmitting(true);
    // Top-level navigation — the install route creates the OAuth state and
    // redirects to Shopify. Never a fetch: tokens must not touch the client.
    window.location.href = `/api/shopify/install?shop=${encodeURIComponent(normalized)}`;
  }

  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6">
      <p className="text-sm font-black text-neutral-900">Connect your Shopify store</p>
      <p className="text-[11px] font-semibold text-neutral-500 mt-1">
        You&apos;ll be redirected to Shopify to authorize access. We only request the scopes needed
        to sync your catalog and orders.
      </p>
      <form
        className="mt-4 flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          connect();
        }}
      >
        <div className="flex-1">
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="your-store.myshopify.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={`w-full rounded-xl border px-3.5 py-2.5 text-sm font-semibold text-neutral-900 placeholder:text-neutral-300 outline-none transition ${
              showError
                ? "border-red-300 focus:border-red-400"
                : "border-neutral-200 focus:border-neutral-400"
            }`}
          />
          {showError && (
            <p className="text-[10px] font-semibold text-red-500 mt-1">
              Enter a valid myshopify.com domain (e.g. your-store.myshopify.com).
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!normalized || submitting}
          className="inline-flex items-center justify-center gap-2 bg-neutral-900 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
          Connect store
        </button>
      </form>
    </div>
  );
}

function Banner({
  tone,
  text,
  onClose,
}: {
  tone: "success" | "error";
  text: string;
  onClose: () => void;
}) {
  const styles =
    tone === "success"
      ? "bg-emerald-50 border-emerald-100 text-emerald-700"
      : "bg-red-50 border-red-100 text-red-600";
  return (
    <div className={`flex items-start gap-2 rounded-2xl border p-3.5 ${styles}`}>
      {tone === "success" ? (
        <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
      )}
      <p className="text-[11px] font-bold flex-1 break-words">{text}</p>
      <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100 transition">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  href,
  sub,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: string;
  tone: string;
  href?: string;
  sub?: string;
}) {
  const body = (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-5 h-full transition-colors hover:border-neutral-300">
      <div className={`flex items-center justify-center size-9 rounded-xl ${tone}`}>
        <Icon className="size-4.5" />
      </div>
      <p className="text-2xl font-black text-neutral-900 mt-4 tracking-tight">{value}</p>
      <p className="text-[11px] font-semibold text-neutral-500 mt-1">{label}</p>
      {sub && <p className="text-[10px] font-medium text-neutral-400 mt-0.5">{sub}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-20 bg-neutral-100 rounded-3xl animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 bg-neutral-100 rounded-3xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="size-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
        <AlertTriangle className="size-7 text-red-400" />
      </div>
      <h3 className="font-black text-neutral-900 text-sm">Couldn&apos;t load Shopify data</h3>
      <p className="text-xs text-neutral-500 max-w-xs mt-1">{message}</p>
      <button
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 bg-neutral-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-neutral-800 transition"
      >
        <RefreshCw className="size-3.5" /> Retry
      </button>
    </div>
  );
}
