"use client";

/**
 * ShopifyView — the merchant's Shopify surface for `/m/shopify`.
 *
 * Two states, driven by the read-model overview (`/api/v1/shopify/overview`):
 *   - DISCONNECTED → a Dev Dashboard connect form. The merchant builds an app in
 *     Shopify's Dev Dashboard inside their OWN org and pastes its domain + Client
 *     ID + Client Secret. These are POSTed once to `/api/v1/shopify/connect`,
 *     exchanged for a short-lived token + encrypted server-side (never returned).
 *     Multi-tenant: each merchant brings their own app — no global OAuth app.
 *   - CONNECTED → ingestion totals + the operational Sync Engine dashboard
 *     (`ShopifySyncPanel`), plus a disconnect control inside the panel.
 *
 * All data flows through the `use-shopify` React Query hooks; no direct fetch,
 * no DB access, no tenant id sent (the v1 guard derives it from the session).
 */

import { useState } from "react";
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
  XCircle,
  Loader2,
  ArrowRight,
  X,
  KeyRound,
  ExternalLink,
  Unplug,
  Ticket,
  Copy,
  Check,
  ChevronDown,
  ShieldCheck,
} from "lucide-react";
import {
  useShopifyOverview,
  useShopifyScopes,
  useCouponDrops,
  useConnectShopify,
  useDisconnectShopify,
  useRefreshShopifyScopes,
} from "@/lib/api/hooks/use-shopify";
import { REQUIRED_SHOPIFY_SCOPES, parseScopes, expandImpliedScopes } from "@/lib/shopify/scopes";
import type { ShopifyCouponDropDTO } from "@/lib/api/types";
import { ShopifySyncPanel } from "./shopify-sync-panel";

/**
 * The Admin API scopes EngageOS needs — shared source of truth in
 * `@/lib/shopify/scopes`. Mostly read-only for the sync engine; `write_discounts`
 * is the sole write scope, required so Coupon Drop campaigns can mint unique
 * discount codes.
 */
const REQUIRED_SCOPES = REQUIRED_SHOPIFY_SCOPES;

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
                    Installed {formatDate(data.shop.installedAt)} · access token auto-renews every 24h
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
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700">
                  <CheckCircle2 className="size-3.5" /> Active
                </span>
                <DisconnectButton />
              </div>
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

              {/* Granted permissions (live from Shopify) */}
              <ScopesCard />

              {/* Coupon Drop generated codes */}
              <CouponDropsCard />

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

/* ──────────────────────────────────────────────────────────
   GRANTED PERMISSIONS (live scopes)
────────────────────────────────────────────────────────── */
function ScopesCard() {
  const { data, isLoading, isError, refetch } = useShopifyScopes();
  const refresh = useRefreshShopifyScopes();
  // Honor Shopify's write-implies-read: a token with write_discounts reports only
  // write_discounts, but read_discounts is effectively granted. Expanding the set
  // keeps the badges truthful instead of flagging implied reads as missing.
  const granted = expandImpliedScopes(parseScopes((data?.granted ?? []).join(",")));
  const missingWrite = !isLoading && !isError && !granted.has("write_discounts");

  async function onRefresh() {
    // Force a fresh Shopify token exchange (picks up scopes enabled after connect),
    // then re-read the badges.
    await refresh.mutateAsync().catch(() => {});
    refetch();
  }

  return (
    <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center size-9 rounded-xl bg-indigo-50 text-indigo-600">
          <ShieldCheck className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-neutral-900">Granted permissions</p>
          <p className="text-[11px] font-semibold text-neutral-500">
            {isLoading
              ? "Reading permissions from Shopify…"
              : data?.live
                ? "Live from your store's Admin API access scopes."
                : "Recorded when you connected (live check unavailable)."}
          </p>
        </div>
        {!isLoading && (
          <button
            onClick={onRefresh}
            disabled={refresh.isPending}
            title="Re-check permissions from Shopify — use this after enabling a new scope on your app."
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] font-bold text-neutral-600 hover:bg-neutral-50 transition cursor-pointer disabled:opacity-50 shrink-0"
          >
            {refresh.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            {refresh.isPending ? "Refreshing…" : "Refresh permissions"}
          </button>
        )}
      </div>

      {isError ? (
        <p className="mt-4 text-[11px] font-bold text-red-600">
          Couldn&apos;t read permissions. Try refreshing.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REQUIRED_SCOPES.map((s) => {
            const has = granted.has(s.handle);
            return (
              <div
                key={s.handle}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${
                  has ? "border-emerald-100 bg-emerald-50/50" : "border-red-100 bg-red-50/50"
                }`}
              >
                {isLoading ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-neutral-300" />
                ) : has ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-red-500" />
                )}
                <div className="min-w-0">
                  <code className="text-[11px] font-black text-neutral-800">{s.handle}</code>
                  <p className="text-[10px] font-semibold text-neutral-500 truncate">
                    {s.for}
                    {s.write ? " · write" : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {missingWrite && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-500" />
          <p className="text-[11px] font-bold text-amber-700">
            <code className="font-black">write_discounts</code> is not granted, so Coupon
            Drop campaigns can&apos;t mint Shopify codes. Enable it in your Dev Dashboard
            app&apos;s Admin API scopes and deploy, then hit{" "}
            <span className="font-black">Refresh permissions</span> above (Shopify keeps
            the old scopes on your current 24h token until it&apos;s re-issued).
          </p>
        </div>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────
   COUPON DROP GENERATED CODES
────────────────────────────────────────────────────────── */
function CouponDropsCard() {
  const { data, isLoading, isError, refetch } = useCouponDrops();
  const campaigns = data?.campaigns ?? [];

  return (
    <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center size-9 rounded-xl bg-rose-50 text-rose-600">
          <Ticket className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-neutral-900">Coupon Drop codes</p>
          <p className="text-[11px] font-semibold text-neutral-500">
            Unique Shopify discount codes minted for your Coupon Drop campaigns.
          </p>
        </div>
        {!isLoading && (
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] font-bold text-neutral-600 hover:bg-neutral-50 transition cursor-pointer"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-neutral-100 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="mt-4 text-[11px] font-bold text-red-600">
          Couldn&apos;t load Coupon Drop data.
        </p>
      ) : campaigns.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-neutral-200 py-8 text-center">
          <p className="text-xs font-bold text-neutral-500">No Coupon Drop campaigns yet.</p>
          <p className="text-[11px] font-semibold text-neutral-400 mt-1">
            Create a Coupon Drop campaign to auto-generate Shopify discount codes.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {campaigns.map((c) => (
            <CouponDropRow key={c.campaign_id} campaign={c} />
          ))}
        </div>
      )}
    </section>
  );
}

const POOL_STATUS_STYLE: Record<string, { label: string; class: string }> = {
  pending: { label: "Pending", class: "bg-neutral-100 text-neutral-600" },
  minting: { label: "Minting…", class: "bg-blue-50 text-blue-700" },
  ready: { label: "Ready", class: "bg-emerald-50 text-emerald-700" },
  error: { label: "Error", class: "bg-red-50 text-red-700" },
};

function CouponDropRow({ campaign }: { campaign: ShopifyCouponDropDTO }) {
  const [open, setOpen] = useState(false);
  const status = POOL_STATUS_STYLE[campaign.pool_status] ?? POOL_STATUS_STYLE.pending;

  return (
    <div className="rounded-2xl border border-neutral-200 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-neutral-900 truncate">{campaign.campaign_name}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${status.class}`}>
              {status.label}
            </span>
            <span className="text-[10px] font-semibold text-neutral-400 capitalize">
              {campaign.campaign_status}
            </span>
          </div>
        </div>
        {campaign.codes_minted > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-[11px] font-bold text-neutral-600 hover:bg-neutral-50 transition cursor-pointer shrink-0"
          >
            Sample codes
            <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {campaign.pool_status === "error" && campaign.pool_last_error && (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] font-bold text-red-600">
          <AlertTriangle className="size-3.5 shrink-0 mt-px" />
          {campaign.pool_last_error}
        </p>
      )}

      <div className="mt-3 grid grid-cols-4 gap-2">
        <PoolStat label="Minted" value={campaign.codes_minted} />
        <PoolStat label="Available" value={campaign.codes_available} />
        <PoolStat label="Claimed" value={campaign.codes_claimed} />
        <PoolStat label="Redeemed" value={campaign.codes_redeemed} highlight />
      </div>

      {campaign.shopify_parent_discount_id && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            Parent discount
          </span>
          <CopyableId value={campaign.shopify_parent_discount_id} />
        </div>
      )}

      {open && (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          {campaign.sample_codes.length === 0 ? (
            <p className="text-[11px] font-semibold text-neutral-400">No codes to show.</p>
          ) : (
            <div className="space-y-1.5">
              {campaign.sample_codes.map((s) => (
                <div
                  key={s.code}
                  className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-1.5"
                >
                  <code className="text-[11px] font-black text-neutral-800">{s.code}</code>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                      s.status === "available"
                        ? "bg-emerald-100 text-emerald-700"
                        : s.status === "claimed"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-neutral-200 text-neutral-600"
                    }`}
                  >
                    {s.status}
                  </span>
                  {s.shopify_redeem_code_id && (
                    <span className="ml-auto truncate text-[10px] font-semibold text-neutral-400">
                      {s.shopify_redeem_code_id}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PoolStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-neutral-50 p-2">
      <p className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">{label}</p>
      <p className={`text-sm font-black ${highlight ? "text-emerald-600" : "text-neutral-900"}`}>
        {value}
      </p>
    </div>
  );
}

function CopyableId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    if (typeof navigator === "undefined") return;
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }
  return (
    <button
      onClick={copy}
      title={value}
      className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-bold text-neutral-600 hover:bg-neutral-200 transition cursor-pointer max-w-full"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="size-3 shrink-0" />
      )}
    </button>
  );
}

function ConnectForm() {
  const connect = useConnectShopify();
  const [shopDomain, setShopDomain] = useState("");  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const canSubmit =
    shopDomain.trim().length > 0 &&
    clientId.trim().length > 0 &&
    clientSecret.trim().length > 0 &&
    !connect.isPending;

  function submit() {
    if (!canSubmit) return;
    connect.mutate({
      shopDomain: shopDomain.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });
  }

  const errorMsg =
    connect.error instanceof Error
      ? connect.error.message
      : connect.isError
        ? "Could not connect the store. Check the credentials and try again."
        : null;

  // On success the overview query is invalidated and the page flips to the
  // connected surface — but show a celebratory animated tick in the meantime so
  // the merchant gets immediate, satisfying confirmation.
  if (connect.isSuccess) {
    return <ConnectSuccess shopName={connect.data?.data?.shopName} />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* The form */}
      <div className="lg:col-span-3 bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-9 rounded-xl bg-emerald-50 text-emerald-600">
            <KeyRound className="size-4.5" />
          </div>
          <div>
            <p className="text-sm font-black text-neutral-900">Connect your Shopify store</p>
            <p className="text-[11px] font-semibold text-neutral-500">
              Paste your Dev Dashboard app credentials — they&apos;re encrypted and never leave our server.
            </p>
          </div>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field
            label="Store domain"
            hint="e.g. your-store.myshopify.com"
            value={shopDomain}
            onChange={setShopDomain}
            placeholder="your-store.myshopify.com"
            type="text"
          />
          <Field
            label="Client ID"
            hint="From your Dev Dashboard app → API credentials → Client ID"
            value={clientId}
            onChange={setClientId}
            placeholder="0123456789abcdef0123456789abcdef"
            type="text"
          />
          <Field
            label="Client secret"
            hint="Same page, under “Client secret”. Also used to verify webhooks from your store."
            value={clientSecret}
            onChange={setClientSecret}
            placeholder="••••••••••••••••••••••••••••••••"
            type="password"
          />

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3">
              <AlertTriangle className="size-4 shrink-0 mt-0.5 text-red-500" />
              <p className="text-[11px] font-bold text-red-600 break-words">{errorMsg}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 bg-neutral-900 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-neutral-800 transition disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
          >
            {connect.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ArrowRight className="size-3.5" />
            )}
            {connect.isPending ? "Verifying with Shopify…" : "Connect store"}
          </button>
        </form>
      </div>

      {/* Setup instructions */}
      <div className="lg:col-span-2 bg-neutral-50 rounded-3xl border border-neutral-200/80 p-6">
        <p className="text-xs font-black text-neutral-900">How to get these</p>
        <ol className="mt-3 space-y-2.5">
          {[
            "Go to the Shopify Dev Dashboard (dev.shopify.com) and open your organization.",
            "Click “Create app” → “Create app manually”, name it (e.g. EngageOS).",
            "Open Configuration → Admin API access scopes and enable the scopes listed below. Save.",
            "Install the app on your store (Overview → Install), then open the API credentials / Client credentials tab.",
            "Copy the Client ID and Client secret into this form.",
          ].map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex items-center justify-center size-5 shrink-0 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">
                {i + 1}
              </span>
              <span className="text-[11px] font-semibold text-neutral-600 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>

        {/* Required scopes — exactly what the sync engine reads */}
        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-3.5">
          <p className="text-[11px] font-black text-neutral-800">
            Admin API scopes to enable
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REQUIRED_SCOPES.map((s) => (
              <code
                key={s.handle}
                title={s.for}
                className="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-bold text-neutral-700"
              >
                {s.handle}
              </code>
            ))}
          </div>
          <p className="mt-2 text-[10px] font-medium text-neutral-400 leading-relaxed">
            All read-only except <code className="font-bold text-neutral-500">write_discounts</code>,
            which lets Coupon Drop campaigns mint unique codes in your store. Missing
            a scope only skips that resource; the rest still sync.
          </p>
        </div>

        <a
          href="https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 transition"
        >
          Shopify Dev Dashboard guide <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

/**
 * Post-connect celebration card. Renders the animated tick + a reassuring line
 * while the overview query refetches and the page swaps to the connected view.
 */
function ConnectSuccess({ shopName }: { shopName?: string }) {
  return (
    <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center py-16 px-8 text-center">
      <SuccessTick />
      <h3 className="mt-5 font-black text-neutral-900 text-base">
        {shopName ? `${shopName} connected!` : "Store connected!"}
      </h3>
      <p className="text-xs font-semibold text-neutral-500 max-w-xs mt-1.5">
        Your first sync is starting — customers, products and orders will appear here shortly.
      </p>
      <span className="mt-4 inline-flex items-center gap-2 text-[11px] font-bold text-emerald-600">
        <Loader2 className="size-3.5 animate-spin" /> Loading your dashboard…
      </span>
    </div>
  );
}

/**
 * Pure-CSS animated success checkmark: an expanding ring pulse, a circle that
 * pops in, and a tick that strokes itself on via stroke-dashoffset. GPU-friendly
 * (transform/opacity + a single stroke animation), no JS timers.
 */
function SuccessTick() {
  return (
    <div className="relative flex items-center justify-center size-20">
      <span className="absolute inset-0 rounded-full bg-emerald-400/40 [animation:var(--animate-tick-ring)]" />
      <svg
        viewBox="0 0 52 52"
        className="relative size-20 [animation:var(--animate-tick-pop)]"
        role="img"
        aria-label="Store connected successfully"
      >
        <circle cx="26" cy="26" r="25" className="fill-emerald-50 stroke-emerald-500" strokeWidth="2" />
        <path
          d="M16 27 l7 7 l13 -14"
          fill="none"
          className="stroke-emerald-500 [stroke-dasharray:40] [stroke-dashoffset:40] [animation:var(--animate-tick-draw)]"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Top-of-page disconnect control (shown in the connection banner when a store is
 * connected). Two-step confirm so a stray click can't revoke the integration.
 * The sync panel keeps its own footer disconnect too; both hit the same mutation.
 */
function DisconnectButton() {
  const disconnect = useDisconnectShopify();
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-[11px] font-bold text-neutral-500 hover:border-red-200 hover:text-red-600 transition"
      >
        <Unplug className="size-3" /> Disconnect
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => disconnect.mutate()}
        disabled={disconnect.isPending}
        className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 transition"
      >
        {disconnect.isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Unplug className="size-3" />
        )}
        Confirm
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="text-[11px] font-bold text-neutral-400 hover:text-neutral-600"
      >
        Cancel
      </button>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type: "text" | "password";
}) {
  return (
    <div>
      <label className="block text-[11px] font-black text-neutral-700">{label}</label>
      <input
        type={type}
        inputMode={type === "text" ? "url" : undefined}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm font-semibold text-neutral-900 placeholder:text-neutral-300 outline-none transition focus:border-neutral-400"
      />
      <p className="text-[10px] font-medium text-neutral-400 mt-1">{hint}</p>
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
