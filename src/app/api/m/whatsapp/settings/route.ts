import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { connectWacrm, disconnectWacrm, updateCouponSettings } from "@/lib/wacrm/adapter";

export const runtime = "nodejs";

const connectSchema = z.object({
  baseUrl: z
    .string()
    .trim()
    .url("Enter the full wacrm URL, e.g. https://crm.example.com")
    .refine((u) => u.startsWith("https://") || u.startsWith("http://localhost"), {
      message: "The wacrm URL must be https://",
    }),
  apiKey: z.string().trim().min(16, "Paste the full API key (wacrm_live_…)"),
});

const settingsSchema = z.object({
  couponTemplateName: z.string().trim().max(120).nullable(),
  couponTemplateLanguage: z.string().trim().min(2).max(15).default("en"),
  autoSendCoupons: z.boolean().default(false),
});

/** Connect this tenant to its wacrm account (verify key → register webhook → store encrypted). */
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

  try {
    const result = await connectWacrm(repo.businessId, parsed.data.baseUrl, parsed.data.apiKey);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    await repo.audit("whatsapp.connect", "business_integration", null, {
      accountName: result.accountName,
      webhookRegistered: result.webhookRegistered,
    });
    await repo.recordEvent("settings.updated", null, {
      section: "whatsapp",
      action: "connected",
      provider: "wacrm",
    });
    return NextResponse.json({
      ok: true,
      accountName: result.accountName,
      webhookRegistered: result.webhookRegistered,
    });
  } catch (err) {
    console.error("wacrm connect error:", err);
    const msg = err instanceof Error ? err.message : "";
    // Misconfiguration (missing/invalid WACRM_ENCRYPTION_KEY, missing
    // integration tables) — tell the operator exactly what to fix.
    if (msg.includes("WACRM_ENCRYPTION_KEY")) {
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
    if (msg.includes("business_integrations") || msg.includes("42P01")) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "WhatsApp integration tables are missing. Apply supabase/migrations/0027_whatsapp_integration.sql, then retry.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "Failed to connect. Try again." },
      { status: 500 }
    );
  }
}

/** Update coupon-delivery settings (template + auto-send). */
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
    await updateCouponSettings(repo.businessId, {
      couponTemplateName: parsed.data.couponTemplateName || null,
      couponTemplateLanguage: parsed.data.couponTemplateLanguage,
      autoSendCoupons: parsed.data.autoSendCoupons,
    });
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

/** Disconnect wacrm (removes the remote webhook, drops the encrypted mapping). */
export async function DELETE(): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await disconnectWacrm(repo.businessId);
    await repo.audit("whatsapp.disconnect", "business_integration", null, {});
    await repo.recordEvent("settings.updated", null, {
      section: "whatsapp",
      action: "disconnected",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("wacrm disconnect error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
