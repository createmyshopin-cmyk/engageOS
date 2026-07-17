import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { WatiApiError } from "@/lib/wati/client";
import { getWatiForBusiness } from "@/lib/wati/adapter";

export const runtime = "nodejs";

const testSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(7, "Enter a phone number with country code")
    .max(20)
    .regex(/^\+?[0-9]+$/, "Digits only, optional leading +"),
  templateName: z.string().trim().min(1, "Template name is required").max(120),
  templateLanguage: z.string().trim().min(2).max(15).optional(),
  params: z
    .array(z.object({ name: z.string().trim().min(1), value: z.string() }))
    .max(20)
    .optional(),
});

/**
 * Send one WATI template message to a merchant-supplied number, so the
 * merchant can confirm the connection end-to-end before relying on it.
 */
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
  const parsed = testSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const tenant = await getWatiForBusiness(repo.businessId);
    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: "WATI is not connected" },
        { status: 409 }
      );
    }

    const phone = parsed.data.phone.replace(/^\+/, "");
    const result = await tenant.client.sendTemplate({
      phoneNumber: phone,
      templateName: parsed.data.templateName,
      broadcastName: `engageos_test_${Date.now()}`,
      params: parsed.data.params,
      channel: tenant.integration.channel_name ?? null,
    });

    await repo.audit("wati.test_send", "wati_integration", null, {
      template: parsed.data.templateName,
      broadcastId: result.broadcast_id ?? null,
    });

    return NextResponse.json({ ok: true, broadcastId: result.broadcast_id ?? null });
  } catch (err) {
    console.error("wati test send error:", err);
    const status = err instanceof WatiApiError ? 502 : 500;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to send test message" },
      { status }
    );
  }
}
