import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { isAdmin } from "@/lib/admin-session";
import { adminClient } from "@/lib/db/rpc";
import { regenerateMerchantLinkAction } from "@/app/admin/actions";
import { AdminShell } from "@/components/admin/admin-shell";
import { CopyLink } from "@/components/admin/copy-link";
import { CreateMerchantAccountForm } from "@/components/admin/create-merchant-account-form";
import {
  eventMeta,
  timeAgo,
  ACTOR_LABEL,
} from "@/components/merchant/campaign-events-timeline";
import type { Business, Campaign, Merchant, RecentCampaignEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Merchant — EngageOS",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  return url.replace(/\/$/, "");
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function MerchantDetailPage({ params }: PageProps) {
  if (!(await isAdmin())) redirect("/admin");
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) redirect("/admin");

  const supabase = adminClient();
  const { data: business, error } = await supabase
    .from("businesses")
    .select("id, name, slug, phone, city, merchant_token, public_id")
    .eq("slug", slug)
    .maybeSingle<
      Pick<Business, "id" | "name" | "slug" | "phone" | "city" | "merchant_token" | "public_id">
    >();
  if (error) {
    console.error("merchant detail error:", error);
    throw new Error("Failed to load merchant");
  }
  if (!business) redirect("/admin");

  const { data: campaigns, error: campError } = await supabase
    .from("campaigns")
    .select("id, name, slug, status, ends_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .returns<Array<Pick<Campaign, "id" | "name" | "slug" | "status" | "ends_at">>>();
  if (campError) {
    console.error("campaigns load error:", campError);
    throw new Error("Failed to load campaigns");
  }

  // Fetch merchant portal accounts for this business
  const { data: merchantAccounts } = await supabase
    .from("merchants")
    .select("id, name, email, role, status, last_login")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .returns<Array<Pick<Merchant, "id" | "name" | "email" | "role" | "status" | "last_login">>>();

  // Cross-tenant activity feed — admin can inspect any business's immutable log.
  const { data: recentRows } = await supabase.rpc("business_recent_events", {
    p_business_id: business.id,
    p_limit: 15,
  });
  const recentEvents = (recentRows ?? []) as RecentCampaignEvent[];

  const base = appUrl();
  const activeCampaign = campaigns?.find((c) => c.status === "active") ?? campaigns?.[0];
  const playUrl = activeCampaign ? `${base}/c/${business.slug}/${activeCampaign.slug}` : null;
  const staffUrl = `${base}/redeem?store=${business.slug}`;
  // Merchants log in at the portal — no public/secret dashboard URL.
  const reportUrl = `${base}/m/login`;

  const qrDataUrl = playUrl
    ? await QRCode.toDataURL(playUrl, { width: 480, margin: 2 })
    : null;

  const onboardingMessage = [
    `Hi! Your Scratch & Win campaign at ${business.name} is LIVE 🎉`,
    ``,
    playUrl ? `Customer QR link: ${playUrl}` : null,
    `Staff coupon check: ${staffUrl} (PIN was set during onboarding)`,
    `Your dashboard login: ${reportUrl}`,
    ``,
    `Print the QR poster and place it at the entrance & billing counter. Most shops get 30–60 scans on a weekend day.`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return (
    <AdminShell back={{ href: "/admin", label: "Merchants" }}>
      {/* Merchant header */}
      <div className="flex items-center gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-lg font-bold text-white shadow-md shadow-emerald-500/20">
          {initials(business.name)}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
              {business.name}
            </h1>
            {activeCampaign?.status === "active" && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-neutral-500">
            {business.city ? `${business.city} · ` : ""}
            {business.phone}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        {/* QR / campaign */}
        <div className="lg:col-span-2">
          {qrDataUrl && activeCampaign ? (
            <section className="rounded-2xl border border-neutral-200/70 bg-white p-6 text-center shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Active campaign
              </p>
              <h2 className="mt-1 text-base font-semibold text-neutral-900">
                {activeCampaign.name}
              </h2>
              <div className="mx-auto mt-4 w-fit rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL QR, no optimizer needed */}
                <img
                  src={qrDataUrl}
                  alt={`QR code for ${activeCampaign.name}`}
                  className="h-52 w-52"
                />
              </div>
              <p className="mt-3 break-all text-xs text-neutral-400">{playUrl}</p>
              <Link
                href={`/m/campaigns/print/${business.slug}/${activeCampaign.slug}`}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
                </svg>
                Open print poster
              </Link>
            </section>
          ) : (
            <section className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /><path d="M14 14h7v7h-7z" />
                </svg>
              </div>
              <p className="mt-3 font-medium text-neutral-900">No campaign yet</p>
              <p className="mt-1 text-sm text-neutral-500">
                This merchant has no active campaign.
              </p>
            </section>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4 lg:col-span-3">
          {/* Links */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-neutral-700">
              Share links
            </h3>
            <CopyLink label="Staff redemption (bookmark on shop phone)" value={staffUrl} />
            <CopyLink label="Merchant dashboard login (send to owner)" value={reportUrl} />
          </section>

          {/* WhatsApp */}
          <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.16c-.25.7-1.44 1.33-1.99 1.37-.53.05-1.02.24-3.44-.72-2.9-1.14-4.75-4.11-4.9-4.3-.14-.19-1.17-1.56-1.17-2.97 0-1.42.74-2.11 1-2.4.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.42-.07.65.5.25.61.84 2.11.91 2.26.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.16-.29.36-.42.49-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.28.14.44.12.6-.07.16-.19.69-.8.87-1.08.18-.28.36-.23.6-.14.25.09 1.57.74 1.84.88.28.14.46.21.53.32.07.11.07.65-.18 1.35Z" />
                </svg>
              </span>
              <h3 className="text-sm font-semibold text-neutral-700">
                Send to the owner on WhatsApp
              </h3>
            </div>
            <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-neutral-50 p-3.5 text-xs leading-relaxed text-neutral-700">
              {onboardingMessage}
            </pre>
            <a
              href={`https://wa.me/${business.phone.replace("+", "")}?text=${encodeURIComponent(onboardingMessage)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Open in WhatsApp
            </a>
          </section>

          {/* Merchant portal accounts */}
          <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-sm space-y-4">
            <div>
              <h3 className="text-sm font-bold text-neutral-900">Merchant Portal Access</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Allow this merchant to log in at <strong>/m/login</strong></p>
            </div>

            {/* Existing accounts */}
            {merchantAccounts && merchantAccounts.length > 0 && (
              <div className="space-y-2">
                {merchantAccounts.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2.5 px-3.5 rounded-xl bg-neutral-50 border border-neutral-100">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-neutral-900 truncate">{m.name}</p>
                      <p className="text-xs text-neutral-500 truncate">{m.email} · <span className="capitalize">{m.role}</span></p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        m.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}>
                        <span className={`size-1.5 rounded-full ${m.status === "active" ? "bg-emerald-500" : "bg-red-500"}`} />
                        {m.status === "active" ? "Active" : "Suspended"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create new account form */}
            <div className="border-t border-neutral-100 pt-4">
              <p className="text-xs font-bold text-neutral-600 mb-3">
                {merchantAccounts && merchantAccounts.length > 0 ? "Add another account" : "Create login account"}
              </p>
              <CreateMerchantAccountForm businessId={business.id} />
            </div>
          </section>

          {/* Danger zone */}
          <section className="rounded-2xl border border-red-200/70 bg-red-50/40 p-5">
            <h3 className="text-sm font-semibold text-red-900">
              Report link leaked?
            </h3>
            <p className="mt-1 text-xs text-red-700/80">
              Generates a new report link. The old link stops working immediately
              — send the owner the new one.
            </p>
            <form
              action={regenerateMerchantLinkAction.bind(null, business.id)}
              className="mt-3"
            >
              <button
                type="submit"
                className="w-full rounded-xl border border-red-300 bg-white py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                Regenerate report link
              </button>
            </form>
          </section>

          {/* Activity log — immutable campaign_events, cross-tenant admin view */}
          <section className="rounded-2xl border border-neutral-200/70 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-neutral-900">Activity log</h3>
              <span className="text-[11px] font-bold text-neutral-400">
                {recentEvents.length} event{recentEvents.length === 1 ? "" : "s"}
              </span>
            </div>
            {recentEvents.length === 0 ? (
              <p className="mt-3 text-xs text-neutral-400 font-medium">
                No activity recorded for this merchant yet.
              </p>
            ) : (
              <ol className="mt-3 divide-y divide-neutral-100">
                {recentEvents.map((e) => {
                  const m = eventMeta(e.event_type);
                  const Icon = m.icon;
                  return (
                    <li key={e.id} className="flex items-start gap-3 py-2.5">
                      <div className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${m.tone}`}>
                        <Icon className="size-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-neutral-900 leading-tight">
                          {m.label}
                          {e.campaign_name && (
                            <span className="font-medium text-neutral-500"> · {e.campaign_name}</span>
                          )}
                        </p>
                        <p className="text-[10px] text-neutral-400 mt-0.5 font-medium">
                          {ACTOR_LABEL[e.actor_type] ?? e.actor_type} · {timeAgo(e.created_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>
    </AdminShell>
  );
}
