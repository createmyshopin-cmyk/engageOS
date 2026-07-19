import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import {
  COMMUNICATION_RULE_EVENT_TYPES,
  communicationRuleLabel,
  listCommunicationRules,
  upsertCommunicationRule,
} from "@/lib/communication/rules";

export const runtime = "nodejs";

const patchSchema = z.object({
  rules: z.array(
    z.object({
      eventType: z.string().min(1),
      enabled: z.boolean(),
      templateName: z.string().trim().max(120).nullable(),
      templateLanguage: z.string().trim().min(2).max(15).default("en"),
    })
  ),
});

export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;

  try {
    const stored = await listCommunicationRules(auth.repo.businessId);
    const byType = new Map(stored.map((r) => [r.event_type, r]));

    const rules = COMMUNICATION_RULE_EVENT_TYPES.map((eventType) => {
      const row = byType.get(eventType);
      return {
        eventType,
        label: communicationRuleLabel(eventType),
        enabled: row?.enabled ?? false,
        templateName: row?.template_name ?? null,
        templateLanguage: row?.template_language ?? "en",
      };
    });

    return NextResponse.json({ ok: true, rules });
  } catch (err) {
    console.error("communication rules GET error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load messaging rules" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid rules payload" },
      { status: 400 }
    );
  }

  try {
    const allowed = new Set<string>(COMMUNICATION_RULE_EVENT_TYPES);
    for (const rule of parsed.data.rules) {
      if (!allowed.has(rule.eventType)) continue;
      await upsertCommunicationRule(auth.repo.businessId, rule.eventType, {
        enabled: rule.enabled,
        templateName: rule.templateName,
        templateLanguage: rule.templateLanguage,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("communication rules PATCH error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save messaging rules" },
      { status: 500 }
    );
  }
}
