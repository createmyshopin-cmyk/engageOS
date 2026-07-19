import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { requireWacrmTenant, wacrmErrorResponse } from "@/lib/communication/wacrm-proxy";
import { insertWhatsappBroadcast, listWhatsappBroadcasts } from "@/lib/wacrm/store";
import { reserveWaQuota, WaQuotaExhaustedError } from "@/lib/communication/quota";

export const runtime = "nodejs";

const launchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  templateName: z.string().trim().min(1).max(120),
  templateLanguage: z.string().trim().min(2).max(15).default("en"),
  phones: z.array(z.string().trim().min(8)).min(1).max(1000),
  segment: z.string().default("manual"),
});

export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;

  const wacrm = await requireWacrmTenant(auth.repo.businessId);
  if (!wacrm.ok) return wacrm.response;

  try {
    const broadcasts = await listWhatsappBroadcasts(auth.repo.businessId);
    return NextResponse.json({ ok: true, broadcasts });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;

  const wacrm = await requireWacrmTenant(auth.repo.businessId);
  if (!wacrm.ok) return wacrm.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = launchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const recipients = parsed.data.phones.map((to) => ({ to }));

  try {
    try {
      await reserveWaQuota(auth.repo.businessId, parsed.data.phones.length);
    } catch (err) {
      if (err instanceof WaQuotaExhaustedError) {
        return NextResponse.json(
          { ok: false, error: "WhatsApp message quota exhausted" },
          { status: 429 }
        );
      }
      throw err;
    }

    const launch = await wacrm.tenant.client.launchBroadcast({
      name: parsed.data.name,
      template_name: parsed.data.templateName,
      template_language: parsed.data.templateLanguage,
      recipients,
    });

    await insertWhatsappBroadcast(auth.repo.businessId, {
      wacrm_broadcast_id: launch.broadcast_id,
      name: parsed.data.name,
      template_name: parsed.data.templateName,
      template_language: parsed.data.templateLanguage,
      segment: parsed.data.segment,
      total_recipients: launch.total_recipients,
      accepted: launch.accepted,
      rejected: launch.rejected,
      status: launch.status,
    });

    await auth.repo.audit("communication.broadcast", "whatsapp_broadcast", null, {
      broadcastId: launch.broadcast_id,
      recipients: launch.accepted,
    });

    return NextResponse.json({ ok: true, launch });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}
