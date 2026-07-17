import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { encryptSecret } from "@/lib/wacrm/crypto";
import { WatiClient, WatiApiError } from "@/lib/wati/client";
import {
  deleteWatiIntegration,
  getWatiIntegration,
  patchWatiIntegration,
  upsertWatiIntegration,
} from "@/lib/wati/store";

export const runtime = "nodejs";

const connectSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .url("Enter a valid WATI API endpoint URL")
    .refine((u) => u.startsWith("https://"), "WATI endpoint must be https"),
  apiToken: z.string().trim().min(20, "WATI API token is required"),
  displayName: z.string().trim().max(120).optional(),
});

const settingsSchema = z.object({
  couponTemplateName: z.string().trim().max(120).nullable(),
  couponTemplateLanguage: z.string().trim().min(2).max(15).default("en"),
  autoSendCoupons: z.boolean().default(false),
  participationTemplateName: z.string().trim().max(120).nullable(),
  participationTemplateLanguage: z.string().trim().min(2).max(15).default("en"),
  autoSendParticipation: z.boolean().default(false),
});

/** Current WATI integration status for this tenant. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const integration = await getWatiIntegration(repo.businessId);
    // Use the actual request origin (e.g. https://engage-os-phi.vercel.app) so it's always production-ready
    const appUrl = req.nextUrl.origin;
    const webhookUrl =
      integration && appUrl
        ? `${appUrl}/api/webhooks/wati?token=${integration.webhook_token}`
        : null;
    return NextResponse.json({
      ok: true,
      connected: !!integration && integration.status !== "disconnected",
      webhookUrl,
      integration: integration
        ? {
            baseUrl: integration.base_url,
            tokenLast4: integration.api_token_last4,
            channelName: integration.channel_name,
            displayName: integration.display_name,
            status: integration.status,
            lastError: integration.last_error,
            couponTemplateName: integration.coupon_template_name,
            couponTemplateLanguage: integration.coupon_template_language,
            autoSendCoupons: integration.auto_send_coupons,
            participationTemplateName: integration.participation_template_name,
            participationTemplateLanguage: integration.participation_template_language,
            autoSendParticipation: integration.auto_send_participation,
            lastVerifiedAt: integration.last_verified_at,
          }
        : null,
    });
  } catch (err) {
    console.error("wati status error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load WATI status" },
      { status: 500 }
    );
  }
}

/** Connect: verify the token against WATI, then persist (token encrypted). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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

  const { baseUrl, apiToken, displayName } = parsed.data;
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  // Clean token if pasted with 'Bearer ' prefix
  let cleanToken = apiToken;
  if (cleanToken.toLowerCase().startsWith("bearer ")) {
    cleanToken = cleanToken.substring(7).trim();
  }

  // Verify by listing channels — a valid token returns 200, a bad one 401/403.
  let channelId: string | null = null;
  let channelName: string | null = null;
  try {
    const client = new WatiClient(normalizedBase, cleanToken);
    const channels = await client.getChannels();
    const whatsapp =
      channels.find((c) => c.channel?.toLowerCase() === "whatsapp") ?? channels[0];
    if (whatsapp) {
      channelId = whatsapp.id;
      channelName = whatsapp.name;
    }
  } catch (err) {
    const msg =
      err instanceof WatiApiError && (err.status === 401 || err.status === 403)
        ? "WATI rejected the token. Check it was copied fully and is not expired."
        : `Could not verify WATI: ${err instanceof Error ? err.message : String(err)}`;
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  try {
    await upsertWatiIntegration(repo.businessId, {
      provider: "wati",
      base_url: normalizedBase,
      api_token_enc: encryptSecret(cleanToken),
      api_token_last4: cleanToken.slice(-4),
      channel_id: channelId,
      channel_name: channelName,
      display_name: displayName || channelName || "WATI WhatsApp",
      status: "connected",
      last_error: null,
      last_verified_at: new Date().toISOString(),
    });

    await repo.audit("wati.connect", "wati_integration", null, {
      channelName,
      displayName: displayName || channelName,
    });

    return NextResponse.json({
      ok: true,
      channelName,
      displayName: displayName || channelName || "WATI WhatsApp",
    });
  } catch (err) {
    console.error("wati connect error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save WATI connection" },
      { status: 500 }
    );
  }
}

/** Update coupon-delivery settings. */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
    const existing = await getWatiIntegration(repo.businessId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Connect WATI before saving settings" },
        { status: 409 }
      );
    }
    await patchWatiIntegration(repo.businessId, {
      coupon_template_name: parsed.data.couponTemplateName || null,
      coupon_template_language: parsed.data.couponTemplateLanguage,
      auto_send_coupons: parsed.data.autoSendCoupons,
      participation_template_name: parsed.data.participationTemplateName || null,
      participation_template_language: parsed.data.participationTemplateLanguage,
      auto_send_participation: parsed.data.autoSendParticipation,
    });
    await repo.recordEvent("settings.updated", null, {
      section: "wati",
      action: "coupon_settings",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("wati settings error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save settings" },
      { status: 500 }
    );
  }
}

/** Disconnect WATI. */
export async function DELETE(): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await deleteWatiIntegration(repo.businessId);
    await repo.audit("wati.disconnect", "wati_integration", null, {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("wati disconnect error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
