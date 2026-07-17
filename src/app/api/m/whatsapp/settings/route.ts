import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { adminClient } from "@/lib/db/rpc";
import { encryptSecret } from "@/lib/wacrm/crypto";
import { verifyPhoneNumber, subscribeWabaToApp, registerPhoneNumber } from "@/lib/wacrm/whatsapp/meta-api";

export const runtime = "nodejs";

const connectSchema = z.object({
  accessToken: z.string().trim().min(30, "Meta token is required"),
  phoneNumberId: z.string().trim().min(5, "Phone Number ID is required"),
  wabaId: z.string().trim().min(5, "WABA ID is required"),
  verifyToken: z.string().trim().min(3, "Webhook Verify Token is required"),
  pin: z.string().trim().max(6).optional(),
});

const settingsSchema = z.object({
  couponTemplateName: z.string().trim().max(120).nullable(),
  couponTemplateLanguage: z.string().trim().min(2).max(15).default("en"),
  autoSendCoupons: z.boolean().default(false),
});

/** Connect this tenant directly to their Meta WhatsApp Business API. */
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

  const { accessToken, phoneNumberId, wabaId, verifyToken, pin } = parsed.data;

  try {
    // 1. Verify credentials by querying Meta
    const phoneInfo = await verifyPhoneNumber({
      phoneNumberId,
      accessToken,
    });

    // 2. Register for inbound webhooks at Meta (best effort)
    try {
      await subscribeWabaToApp({ wabaId, accessToken });
      if (pin) {
        await registerPhoneNumber({ phoneNumberId, accessToken, pin });
      }
    } catch (err) {
      console.warn("Meta subscription warning:", err);
    }

    // 3. Ensure a row exists in wacrm accounts table for foreign key constraints
    const { error: accountError } = await adminClient()
      .from("accounts")
      .upsert(
        { id: repo.businessId, name: phoneInfo.verified_name || phoneInfo.display_phone_number, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
    if (accountError) throw new Error("accounts upsert failed: " + accountError.message);

    // 4. Save to wacrm's whatsapp_config
    const { error: wacrmConfError } = await adminClient()
      .from("whatsapp_config")
      .upsert(
        {
          account_id: repo.businessId,
          user_id: repo.session.merchantId, // Logged in merchant is the config manager
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          access_token: encryptSecret(accessToken),
          verify_token: encryptSecret(verifyToken),
          status: "connected",
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          registered_at: new Date().toISOString(),
        },
        { onConflict: "account_id" }
      );

    if (wacrmConfError) throw new Error("whatsapp_config upsert failed: " + wacrmConfError.message);

    // 5. Save to EngageOS business_integrations to mark connection status
    const { error: integrationError } = await adminClient()
      .from("business_integrations")
      .upsert(
        {
          business_id: repo.businessId,
          provider: "wacrm",
          base_url: "http://localhost:3000",
          api_key_enc: encryptSecret("local-dummy-key"),
          api_key_last4: "local",
          account_id: repo.businessId,
          account_name: phoneInfo.verified_name || phoneInfo.display_phone_number,
          status: "connected",
          last_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "business_id" }
      );

    if (integrationError) throw new Error("business_integrations upsert failed: " + integrationError.message);

    await repo.audit("whatsapp.connect", "business_integration", null, {
      accountName: phoneInfo.verified_name || phoneInfo.display_phone_number,
      phoneNumber: phoneInfo.display_phone_number,
    });

    return NextResponse.json({
      ok: true,
      accountName: phoneInfo.verified_name || phoneInfo.display_phone_number,
      webhookRegistered: true,
    });
  } catch (err) {
    console.error("Local wacrm connect error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to connect to Meta API" },
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
    const { error } = await adminClient()
      .from("business_integrations")
      .update({
        coupon_template_name: parsed.data.couponTemplateName || null,
        coupon_template_language: parsed.data.couponTemplateLanguage,
        auto_send_coupons: parsed.data.autoSendCoupons,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", repo.businessId);

    if (error) throw error;

    await repo.recordEvent("settings.updated", null, {
      section: "whatsapp",
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

/** Disconnect wacrm. */
export async function DELETE(): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await adminClient()
      .from("business_integrations")
      .delete()
      .eq("business_id", repo.businessId);

    await adminClient()
      .from("whatsapp_config")
      .delete()
      .eq("account_id", repo.businessId);

    await repo.audit("whatsapp.disconnect", "business_integration", null, {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("wacrm disconnect error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
