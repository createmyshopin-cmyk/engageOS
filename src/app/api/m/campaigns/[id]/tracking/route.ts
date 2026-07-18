import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { PROVIDER_KEYS } from "@/lib/tracking/types";
import { isValidProviderId } from "@/lib/tracking/validation";
import {
  getCampaignTrackingConfig,
  setCampaignTrackingMode,
  upsertCampaignTrackingOverride,
} from "@/lib/tracking/store";

export const runtime = "nodejs";

const providerEnum = z.enum(PROVIDER_KEYS as unknown as [string, ...string[]]);

const patchSchema = z.object({
  useDefault: z.boolean(),
  overrides: z
    .array(
      z.object({
        provider: providerEnum,
        enabled: z.boolean(),
        providerId: z.string().trim().max(64).nullable(),
      }),
    )
    .max(PROVIDER_KEYS.length)
    .optional(),
});

/** Campaign-level tracking config (mode + per-provider overrides) for the tenant. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const config = await getCampaignTrackingConfig(repo.businessId, id);
    if (!config) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, ...config });
  } catch (err) {
    console.error("campaign tracking GET error:", err);
    return NextResponse.json({ ok: false, error: "Failed to load" }, { status: 500 });
  }
}

/**
 * Set the campaign tracking mode and, when campaign-specific, upsert the
 * per-provider overrides. Every write goes through a tenant-checked RPC.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

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
  const { useDefault, overrides } = parsed.data;

  // Validate every enabled override ID server-side before anything is written —
  // a malformed ID must never reach a customer browser.
  for (const o of overrides ?? []) {
    const oid = o.providerId?.trim() || null;
    if (o.enabled && oid && !isValidProviderId(o.provider as never, oid)) {
      return NextResponse.json(
        { ok: false, error: `Invalid ${o.provider} ID format` },
        { status: 422 },
      );
    }
  }

  try {
    // Ownership guard: this throws/returns null path only if the campaign is
    // not the tenant's (the RPCs re-check too).
    const existing = await getCampaignTrackingConfig(repo.businessId, id);
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    await setCampaignTrackingMode({
      businessId: repo.businessId,
      campaignId: id,
      useDefault,
    });

    if (!useDefault) {
      for (const o of overrides ?? []) {
        await upsertCampaignTrackingOverride({
          businessId: repo.businessId,
          campaignId: id,
          provider: o.provider as never,
          enabled: o.enabled,
          providerId: o.providerId?.trim() || null,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("campaign tracking PATCH error:", err);
    return NextResponse.json({ ok: false, error: "Failed to save" }, { status: 500 });
  }
}
