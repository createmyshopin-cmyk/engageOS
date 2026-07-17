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

    // Automatically construct placeholder values for any variables in the template
    let customParams: { name: string; value: string }[] = [];
    try {
      const templates = await tenant.client.getTemplates(1, 100);
      const matched = templates.find((t) => t.name === parsed.data.templateName);
      if (matched) {
        const bodyOriginal = (matched as any).body_original || (matched as any).body || "";
        if (bodyOriginal) {
          const regex = /\{\{([^}]+)\}\}/g;
          const matches: string[] = [];
          let match;
          while ((match = regex.exec(bodyOriginal)) !== null) {
            if (match[1]) matches.push(match[1].trim());
          }

          if (matches.length > 0) {
            const isNumeric = matches.every((m) => /^\d+$/.test(m));
            if (isNumeric) {
              let positionalValues = [];
              if (matches.length <= 3) {
                positionalValues = ["Test Customer", "10% OFF", "ENGAGEOS-TEST"];
              } else {
                positionalValues = [
                  "Test Customer",
                  tenant.integration.display_name || "My Shop",
                  "10% OFF",
                  "ENGAGEOS-TEST",
                  "28 Dec, 2026",
                  tenant.integration.display_name || "My Shop",
                ];
              }
              customParams = matches.map((m, idx) => ({
                name: m,
                value: positionalValues[idx] || "Test Value",
              }));
            } else {
              customParams = matches.map((m) => {
                const key = m.toLowerCase().replace(/[^a-z0-9]/g, "");
                let value = "Test Value";
                if (
                  key === "name" ||
                  key === "bsuidusername" ||
                  key === "externalname" ||
                  key === "customername" ||
                  key === "firstname"
                ) {
                  value = "Test Customer";
                } else if (key === "phone" || key === "bsuid") {
                  value = phone;
                } else if (key === "channel") {
                  value = "WhatsApp";
                } else if (key === "source") {
                  value = "EngageOS Campaign";
                } else if (
                  key === "lastcartitems" ||
                  key === "lastcartitemstext" ||
                  key === "giftname" ||
                  key === "prizename" ||
                  key === "reward"
                ) {
                  value = "EngageOS Test Prize";
                } else if (
                  key === "lastcarttotalvalue" ||
                  key === "lastcarttotalvaluetext" ||
                  key === "lastcarttotalvaluetextamount" ||
                  key === "couponcode" ||
                  key === "code" ||
                  key === "externalid" ||
                  key === "discountcode"
                ) {
                  value = "ENGAGEOS-TEST";
                } else if (
                  key.includes("merchant") ||
                  key.includes("business") ||
                  key.includes("team") ||
                  key === "shopname"
                ) {
                  value = tenant.integration.display_name || "My Shop";
                } else if (
                  key.includes("date") ||
                  key.includes("until") ||
                  key.includes("expiry") ||
                  key.includes("valid")
                ) {
                  value = "28 Dec, 2026";
                } else if (key === "city") {
                  value = "Kochi";
                }
                return { name: m, value };
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to map test template custom params:", err);
    }

    const result = await tenant.client.sendTemplate({
      phoneNumber: phone,
      templateName: parsed.data.templateName,
      broadcastName: `engageos_test_${Date.now()}`,
      params:
        parsed.data.params && parsed.data.params.length > 0 ? parsed.data.params : customParams,
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
