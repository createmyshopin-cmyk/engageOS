import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { isAdmin } from "@/lib/admin-session";
import { getMerchantSession } from "@/lib/merchant-session";
import { adminClient, recordCampaignEvent } from "@/lib/db/rpc";
import { PrintButton } from "@/components/admin/print-button";
import type { Business } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Print poster — EngageOS",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ merchantSlug: string; campaignSlug: string }>;
}

export default async function PrintPage({ params }: PageProps) {
  const { merchantSlug, campaignSlug } = await params;
  const supabase = adminClient();

  // Resolve the campaign by the (merchantSlug, campaignSlug) pair — a campaign
  // only ever resolves for its owning business. Authorization is by session
  // (owning merchant) or admin.
  const { data: resolvedBusiness } = await supabase
    .from("businesses")
    .select("id, name, slug")
    .eq("slug", merchantSlug)
    .maybeSingle<Pick<Business, "id" | "name" | "slug">>();

  if (!resolvedBusiness) notFound();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, slug, headline, business_id")
    .eq("slug", campaignSlug)
    .eq("business_id", resolvedBusiness.id)
    .maybeSingle();

  if (!campaign) notFound();

  const admin = await isAdmin();
  const session = await getMerchantSession();
  const isAuthorizedMerchant =
    session && session.businessId === campaign.business_id;

  if (!admin && !isAuthorizedMerchant) {
    redirect("/m/login");
  }

  const h = await headers();
  const host = h.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  const base = `${protocol}://${host}`;
  const playUrl = `${base}/c/${resolvedBusiness.slug}/${campaign.slug}`;
  const staffUrl = `${base}/redeem?store=${resolvedBusiness.slug}`;

  const [playQr, staffQr] = await Promise.all([
    QRCode.toDataURL(playUrl, { width: 800, margin: 2 }),
    QRCode.toDataURL(staffUrl, { width: 400, margin: 2 }),
  ]);

  // Track poster generation as immutable campaign events. The QR is generated
  // server-side here, and this page is the print sheet, so we record both the
  // QR generation and the poster print/open. Actor is the platform admin or the
  // owning merchant. Best-effort — never blocks rendering the poster.
  {
    const ua = h.get("user-agent");
    const actorType = admin ? "platform_admin" : "merchant_owner";
    const actorId = admin ? null : session?.merchantId ?? null;
    await recordCampaignEvent({
      businessId: campaign.business_id,
      campaignId: campaign.id,
      actorType,
      actorId,
      eventType: "qr.generated",
      metadata: { slug: campaign.slug, merchantSlug: resolvedBusiness.slug, playUrl },
      userAgent: ua,
    });
    await recordCampaignEvent({
      businessId: campaign.business_id,
      campaignId: campaign.id,
      actorType,
      actorId,
      eventType: "poster.printed",
      metadata: { slug: campaign.slug, merchantSlug: resolvedBusiness.slug },
      userAgent: ua,
    });
    await recordCampaignEvent({
      businessId: campaign.business_id,
      campaignId: campaign.id,
      actorType,
      actorId,
      eventType: "qr.printed",
      metadata: { slug: campaign.slug, merchantSlug: resolvedBusiness.slug },
      userAgent: ua,
    });
  }

  return (
    <main className="bg-white text-neutral-900 print:text-black">
      {/* Page 1 — customer poster */}
      <section
        className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center p-10 text-center"
        style={{ pageBreakAfter: "always" }}
      >
        <p className="text-2xl font-semibold">{resolvedBusiness.name}</p>
        <h1 className="mt-4 text-5xl font-extrabold leading-tight">
          {campaign.headline}
        </h1>
        <p className="mt-3 text-xl text-neutral-600">
          Scan · Scratch · Win instantly 🎁
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- print sheet, data URL */}
        <img src={playQr} alt="Campaign QR code" className="mt-8 h-80 w-80" />
        <p className="mt-6 text-sm text-neutral-400">Powered by EngageOS</p>
      </section>

      {/* Page 2 — staff sticker */}
      <section className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center p-10 text-center">
        <div className="rounded-3xl border-4 border-dashed border-neutral-300 p-10">
          <h2 className="text-2xl font-bold">STAFF ONLY</h2>
          <p className="mt-2 text-lg text-neutral-600">
            Scan to check customer coupons
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- print sheet, data URL */}
          <img
            src={staffQr}
            alt="Staff redemption QR code"
            className="mx-auto mt-6 h-48 w-48"
          />
          <ol className="mx-auto mt-6 max-w-xs list-decimal space-y-1 text-left text-sm text-neutral-700">
            <li>Scan this QR (or open the bookmark)</li>
            <li>Enter the shop PIN</li>
            <li>Type the 4 letters of the coupon</li>
            <li>
              <span className="font-bold text-emerald-700">GREEN</span> = give
              the prize ·{" "}
              <span className="font-bold text-red-600">RED</span> = do not
            </li>
          </ol>
        </div>
        <PrintButton />
      </section>
    </main>
  );
}
