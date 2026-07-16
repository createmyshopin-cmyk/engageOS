import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { CampaignEditForm } from "@/components/merchant/campaign-edit-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Campaign } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit Campaign — EngageOS",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignEditPage({ params }: PageProps) {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");
  const session = repo.session;

  const { id } = await params;

  const campaign = await repo.getCampaign<
    Pick<
      Campaign,
      | "id"
      | "name"
      | "headline"
      | "description"
      | "banner_url"
      | "logo_url"
      | "terms"
      | "coupon_prefix"
      | "starts_at"
      | "ends_at"
      | "status"
    >
  >(
    id,
    "id, name, headline, description, banner_url, logo_url, terms, coupon_prefix, starts_at, ends_at, status"
  );

  if (!campaign) notFound();

  const business = await repo.getBusiness<{ name: string; city: string | null }>(
    "name, city"
  );

  return (
    <MerchantShell
      businessName={business?.name ?? session.name}
      city={business?.city ?? null}
      campaignActive={campaign.status === "active"}
    >
      {/* Back */}
      <div className="mb-6">
        <Link
          href={`/m/campaigns/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to Campaign
        </Link>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-neutral-900">Edit Campaign</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Update campaign details. Prizes and rewards are managed separately.
          </p>
        </div>

        <CampaignEditForm campaign={campaign} />
      </div>
    </MerchantShell>
  );
}
