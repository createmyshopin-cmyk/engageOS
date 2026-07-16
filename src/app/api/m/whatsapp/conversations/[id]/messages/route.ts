import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getWacrmForBusiness } from "@/lib/wacrm/adapter";
import { WacrmApiError } from "@/lib/wacrm/client";
import { recordMessageMap } from "@/lib/wacrm/store";

export const runtime = "nodejs";

/** Message history of one conversation, read live from wacrm. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const tenant = await getWacrmForBusiness(repo.businessId);
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "wacrm is not connected" }, { status: 409 });
  }

  const { id } = await params;
  try {
    const page = await tenant.client.listMessages(id, {
      cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
      limit: 50,
    });
    return NextResponse.json({ ok: true, messages: page.data, nextCursor: page.next_cursor });
  } catch (err) {
    console.error("wacrm messages error:", err);
    const status = err instanceof WacrmApiError && err.status === 404 ? 404 : 502;
    const msg = err instanceof WacrmApiError ? err.message : "Failed to load messages";
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

const replySchema = z.object({
  text: z.string().trim().min(1, "Type a message").max(4096),
});

/**
 * Reply in a conversation. wacrm's public send endpoint addresses by phone,
 * so the conversation's contact is resolved first (which also enforces that
 * the conversation belongs to THIS tenant's wacrm account).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const tenant = await getWacrmForBusiness(repo.businessId);
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "wacrm is not connected" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { id } = await params;
  try {
    const { data: conversation } = await tenant.client.getConversation(id);
    const phone = conversation.contact?.phone;
    if (!phone) {
      return NextResponse.json(
        { ok: false, error: "Conversation has no contact phone" },
        { status: 404 }
      );
    }

    const { data: sent } = await tenant.client.sendText(phone, parsed.data.text);
    await recordMessageMap({
      business_id: repo.businessId,
      whatsapp_message_id: sent.whatsapp_message_id,
      wacrm_message_id: sent.message_id,
      wacrm_conversation_id: sent.conversation_id,
      purpose: "inbox_reply",
    });
    return NextResponse.json({ ok: true, messageId: sent.message_id });
  } catch (err) {
    console.error("wacrm reply error:", err);
    const status = err instanceof WacrmApiError && err.status === 404 ? 404 : 502;
    const msg = err instanceof WacrmApiError ? err.message : "Failed to send reply";
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
