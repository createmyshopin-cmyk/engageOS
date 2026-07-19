import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { encryptSecret, decryptSecret } from "@/lib/wacrm/crypto";
import { WacrmClient, WacrmApiError } from "@/lib/wacrm/client";
import {
  deleteWacrmIntegration,
  getWacrmIntegration,
  getWacrmIntegrationByAccountId,
  patchWacrmIntegration,
  upsertWacrmIntegration,
} from "@/lib/wacrm/store";
import { WACRM_REQUIRED_SCOPES } from "@/lib/wacrm/types";
import { assertWhatsAppProviderAvailable } from "@/lib/communication/provider";
import { deleteWatiIntegration } from "@/lib/wati/store";
import { isDeliverableUrl } from "@/lib/wacrm/webhooks/ssrf";

export const runtime = "nodejs";

const connectSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .url("Enter a valid WACRM URL")
    .refine((u) => u.startsWith("https://"), "WACRM URL must be https"),
  apiKey: z.string().trim().min(20, "WACRM API key is required"),
  displayName: z.string().trim().max(120).optional(),
});

const settingsSchema = z.object({
  couponTemplateName: z.string().trim().max(120).nullable(),
  couponTemplateLanguage: z.string().trim().min(2).max(15).default("en"),
  autoSendCoupons: z.boolean().default(false),
});

function resolveAppUrl(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL must be set in production");
  }
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  if (host) return `${protocol}://${host}`.replace(/\/+$/, "");
  return "";
}

function cleanApiKey(raw: string): string {
  let key = raw.trim();
  if (key.toLowerCase().startsWith("bearer ")) {
    key = key.slice(7).trim();
  }
  return key;
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  try {
    const integration = await getWacrmIntegration(repo.businessId);
    const appUrl = resolveAppUrl(req);
    const webhookUrl = appUrl ? `${appUrl}/api/webhooks/wacrm` : null;

    return NextResponse.json({
      ok: true,
      connected: !!integration && integration.status !== "disconnected",
      webhookUrl,
      integration: integration
        ? {
            baseUrl: integration.base_url,
            keyLast4: integration.api_key_last4,
            accountId: integration.account_id,
            accountName: integration.account_name,
            status: integration.status,
            lastError: integration.last_error,
            couponTemplateName: integration.coupon_template_name,
            couponTemplateLanguage: integration.coupon_template_language,
            autoSendCoupons: integration.auto_send_coupons,
            lastVerifiedAt: integration.last_verified_at,
            webhookRegistered: !!integration.webhook_id,
          }
        : null,
    });
  } catch (err) {
    console.error("wacrm status error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load WACRM status" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const availability = await assertWhatsAppProviderAvailable(repo.businessId, "wacrm");
  if (!availability.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Another WhatsApp provider is already active. Disconnect it first.",
      },
      { status: 409 }
    );
  }

  const baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");
  const apiKey = cleanApiKey(parsed.data.apiKey);
  const appUrl = resolveAppUrl(req);

  const allowPrivate = process.env.WACRM_ALLOW_PRIVATE_URLS === "true";
  if (!allowPrivate) {
    const safe = await isDeliverableUrl(baseUrl);
    if (!safe) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "WACRM URL must be a public HTTPS endpoint. For local/self-hosted dev, set WACRM_ALLOW_PRIVATE_URLS=true.",
        },
        { status: 400 }
      );
    }
  }

  let me;
  try {
    const client = new WacrmClient(baseUrl, apiKey);
    me = await client.me();
  } catch (err) {
    const msg =
      err instanceof WacrmApiError
        ? err.message
        : `Could not verify WACRM: ${err instanceof Error ? err.message : String(err)}`;
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const missingScopes = WACRM_REQUIRED_SCOPES.filter(
    (scope) => !me.key.scopes.includes(scope)
  );
  if (missingScopes.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `API key is missing scopes: ${missingScopes.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const linkedElsewhere = await getWacrmIntegrationByAccountId(me.account.id);
  if (linkedElsewhere && linkedElsewhere.business_id !== repo.businessId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This WACRM account is already linked to another EngageOS business. Use a separate WACRM account per merchant.",
      },
      { status: 409 }
    );
  }

  const previous = await getWacrmIntegration(repo.businessId);
  if (previous?.webhook_id && previous.api_key_enc) {
    try {
      const prevClient = new WacrmClient(
        previous.base_url,
        decryptSecret(previous.api_key_enc)
      );
      await prevClient.deleteWebhook(previous.webhook_id);
    } catch (err) {
      console.warn("Could not delete prior WACRM webhook on reconnect:", err);
    }
  }

  let webhookId: string | null = null;
  let webhookSecretEnc: string | null = null;

  if (appUrl.startsWith("https://")) {
    try {
      const client = new WacrmClient(baseUrl, apiKey);
      const webhook = await client.registerWebhook({
        url: `${appUrl}/api/webhooks/wacrm`,
        events: ["message.received", "message.status_updated", "conversation.created"],
      });
      webhookId = webhook.id;
      webhookSecretEnc = encryptSecret(webhook.secret);
    } catch (err) {
      console.warn("WACRM webhook registration skipped:", err);
    }
  }

  try {
    await deleteWatiIntegration(repo.businessId);

    await upsertWacrmIntegration(repo.businessId, {
      base_url: baseUrl,
      api_key_enc: encryptSecret(apiKey),
      api_key_last4: apiKey.slice(-4),
      account_id: me.account.id,
      account_name: parsed.data.displayName || me.account.name,
      webhook_id: webhookId,
      webhook_secret_enc: webhookSecretEnc,
      status: "connected",
      last_error: webhookId ? null : "Webhook not registered — use a public https URL",
      last_verified_at: new Date().toISOString(),
    });

    await repo.audit("wacrm.connect", "business_integration", null, {
      accountId: me.account.id,
      accountName: me.account.name,
    });

    return NextResponse.json({
      ok: true,
      accountName: parsed.data.displayName || me.account.name,
      webhookRegistered: !!webhookId,
    });
  } catch (err) {
    console.error("wacrm connect error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save WACRM connection" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const existing = await getWacrmIntegration(repo.businessId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Connect WACRM before saving settings" },
        { status: 409 }
      );
    }

    await patchWacrmIntegration(repo.businessId, {
      coupon_template_name: parsed.data.couponTemplateName || null,
      coupon_template_language: parsed.data.couponTemplateLanguage,
      auto_send_coupons: parsed.data.autoSendCoupons,
    });

    await repo.recordEvent("settings.updated", null, {
      section: "wacrm",
      action: "coupon_settings",
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("wacrm settings error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save settings" },
      { status: 500 }
    );
  }
}

export async function DELETE(): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  try {
    const existing = await getWacrmIntegration(repo.businessId);
    if (existing?.webhook_id && existing.api_key_enc) {
      try {
        const { decryptSecret } = await import("@/lib/wacrm/crypto");
        const client = new WacrmClient(
          existing.base_url,
          decryptSecret(existing.api_key_enc)
        );
        await client.deleteWebhook(existing.webhook_id);
      } catch (err) {
        console.warn("Failed to delete WACRM webhook on disconnect:", err);
      }
    }

    await deleteWacrmIntegration(repo.businessId);
    await repo.audit("wacrm.disconnect", "business_integration", null, {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("wacrm disconnect error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
