import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { PROVIDER_KEYS } from "@/lib/tracking/types";
import { isValidProviderId } from "@/lib/tracking/validation";
import { listBusinessTracking, upsertBusinessTracking } from "@/lib/tracking/store";

export const runtime = "nodejs";

const providerEnum = z.enum(PROVIDER_KEYS as unknown as [string, ...string[]]);

const patchSchema = z.object({
  provider: providerEnum,
  enabled: z.boolean(),
  providerId: z.string().trim().max(64).nullable(),
  notes: z.string().trim().max(500).nullable().optional(),
});

/** All tracking provider configs for the current tenant. */
export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;
  const { repo } = auth;
  try {
    const rows = await listBusinessTracking(repo.businessId);
    return NextResponse.json({ ok: true, integrations: rows });
  } catch (err) {
    console.error("tracking GET error:", err);
    return NextResponse.json({ ok: false, error: "Failed to load" }, { status: 500 });
  }
}

/** Enable/disable + set the id for ONE provider. */
export async function PATCH(req: Request): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }
  const { provider, enabled, providerId } = parsed.data;
  const notes = parsed.data.notes ?? null;

  // Server-side id validation. An enabled provider MUST have a valid id — this
  // is the primary guard against a malformed id reaching the customer's browser.
  const id = providerId?.trim() || null;
  if (enabled && id && !isValidProviderId(provider as never, id)) {
    return NextResponse.json(
      { ok: false, error: `Invalid ${provider} ID format` },
      { status: 422 },
    );
  }

  const status: "connected" | "disconnected" = enabled && id ? "connected" : "disconnected";

  try {
    await upsertBusinessTracking({
      businessId: repo.businessId,
      provider: provider as never,
      enabled,
      providerId: id,
      notes,
      status,
    });
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    console.error("tracking PATCH error:", err);
    return NextResponse.json({ ok: false, error: "Failed to save" }, { status: 500 });
  }
}
