import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getIntegration } from "@/lib/wacrm/store";
import type { WacrmIntegration } from "@/lib/wacrm/types";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import { WhatsAppTabs } from "@/components/merchant/whatsapp/whatsapp-tabs";
import { MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WhatsApp — EngageOS",
  robots: { index: false, follow: false },
};

/**
 * Merchant WhatsApp hub. EngageOS is the campaign engine; wacrm is the
 * CRM/messaging engine. Every tab consumes wacrm through the EngageOS
 * adapter (/api/m/whatsapp/*) — the browser never talks to wacrm directly
 * and no CRM feature is duplicated.
 */
export default async function WhatsAppPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login?from=/m/whatsapp");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login?from=/m/whatsapp");

  let integration: WacrmIntegration | null = null;
  try {
    integration = await getIntegration(repo.businessId);
  } catch (err) {
    console.error("whatsapp integration load error:", err);
  }

  const campaignRows = await repo
    .select("campaigns", "id, name, status")
    .order("created_at", { ascending: false })
    .limit(100);
  const campaigns = ((campaignRows.data ?? []) as any[]).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    status: c.status as string,
  }));

  return (
    <MerchantShell businessName={biz.name} city={biz.city} hideHeader>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-2xl bg-[#DCFCE7]">
            <MessageSquare className="size-5 text-[#16A34A]" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#111827]">WhatsApp</h1>
            <p className="text-xs text-[#6B7280] font-medium">
              Campaigns run on EngageOS — messaging, inbox and automations run on your
              connected wacrm workspace.
            </p>
          </div>
        </div>

        <WhatsAppTabs
          connected={!!integration && integration.status !== "disconnected"}
          baseUrl={integration?.base_url ?? null}
          campaigns={campaigns}
        />
      </div>
    </MerchantShell>
  );
}
