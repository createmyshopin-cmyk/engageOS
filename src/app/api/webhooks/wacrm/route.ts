import { NextRequest, NextResponse } from "next/server";
import { verifyWacrmSignature } from "@/lib/wacrm/crypto";
import {
  getWebhookSecret,
  processWacrmWebhook,
  resolveWacrmIntegrationForWebhook,
} from "@/lib/wacrm/webhook";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  let envelope: {
    id: string;
    event: string;
    occurred_at: string;
    account_id: string;
    data: Record<string, unknown>;
  };

  try {
    envelope = JSON.parse(rawBody) as typeof envelope;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!envelope?.account_id || !envelope?.id || !envelope?.event) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const integration = await resolveWacrmIntegrationForWebhook(envelope.account_id);
  if (!integration || integration.status === "disconnected") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const secret = getWebhookSecret(integration);
  if (!secret) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const signature = req.headers.get("x-wacrm-signature");
  if (!verifyWacrmSignature(signature, rawBody, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    await processWacrmWebhook(integration, envelope);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("wacrm webhook error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
