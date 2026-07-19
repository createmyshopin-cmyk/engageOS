import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { requireWacrmTenant, wacrmErrorResponse } from "@/lib/communication/wacrm-proxy";
import { adminClient } from "@/lib/db/rpc";
import { recordCommunicationTimelineEvent } from "@/lib/communication/timeline";
import { reserveWaQuota, WaQuotaExhaustedError } from "@/lib/communication/quota";

export const runtime = "nodejs";

const sendSchema = z.object({
  to: z.string().trim().min(8),
  text: z.string().trim().min(1).max(4096),
  replyToMessageId: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const wacrm = await requireWacrmTenant(auth.repo.businessId);
  if (!wacrm.ok) return wacrm.response;

  const { searchParams } = req.nextUrl;
  try {
    const result = await wacrm.tenant.client.listMessages(id, {
      limit: Number(searchParams.get("limit") ?? 50),
      cursor: searchParams.get("cursor") ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;

  const { id: conversationId } = await ctx.params;

  const wacrm = await requireWacrmTenant(auth.repo.businessId);
  if (!wacrm.ok) return wacrm.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    try {
      await reserveWaQuota(auth.repo.businessId, 1);
    } catch (err) {
      if (err instanceof WaQuotaExhaustedError) {
        return NextResponse.json(
          { ok: false, error: "WhatsApp message quota exhausted" },
          { status: 429 }
        );
      }
      throw err;
    }

    const message = await wacrm.tenant.client.sendText(parsed.data);

    const { data: customer } = await adminClient()
      .from("customers")
      .select("id")
      .eq("business_id", auth.repo.businessId)
      .eq("phone", parsed.data.to)
      .maybeSingle<{ id: string }>();

    await adminClient().from("wa_message_map").insert({
      business_id: auth.repo.businessId,
      whatsapp_message_id: message.whatsapp_message_id,
      wacrm_message_id: message.message_id,
      wacrm_conversation_id: conversationId,
      customer_id: customer?.id ?? null,
      purpose: "inbox_reply",
      status: "sent",
    });

    await auth.repo.recordEvent("whatsapp.sent", null, {
      channel: "wacrm",
      purpose: "inbox_reply",
      wamid: message.whatsapp_message_id,
    });

    await recordCommunicationTimelineEvent({
      businessId: auth.repo.businessId,
      customerId: customer?.id ?? null,
      eventName: "whatsapp.agent_replied",
      payload: {
        channel: "wacrm",
        wamid: message.whatsapp_message_id,
        conversationId,
      },
      dedupKey: `wa:agent:${message.whatsapp_message_id}`,
    });

    return NextResponse.json({ ok: true, message });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}
