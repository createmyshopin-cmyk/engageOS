import "server-only";
import { NextResponse } from "next/server";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import type { MerchantRole, MerchantSessionPayload } from "@/lib/types";
import type { TenantRepository } from "@/lib/db/tenant-repository";

/** Roles allowed to read merchant portal data (dashboards, inbox, analytics). */
export const MERCHANT_READ_ROLES = ["owner", "manager", "staff"] as const satisfies readonly MerchantRole[];

/** Roles allowed to mutate integrations, settings, campaigns, and exports. */
export const MERCHANT_WRITE_ROLES = ["owner", "manager"] as const satisfies readonly MerchantRole[];

export type MerchantAuthResult =
  | { ok: true; repo: TenantRepository; session: MerchantSessionPayload }
  | { ok: false; response: NextResponse<{ ok: false; error: string }> };

/**
 * Authenticate a legacy /api/m/* request and optionally enforce merchant role.
 * Tenancy is always derived from the session — never from request input.
 */
export async function authorizeMerchant(
  ...roles: readonly MerchantRole[]
): Promise<MerchantAuthResult> {
  const repo = await getTenantRepository();
  if (!repo) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (roles.length > 0 && !roles.includes(repo.session.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Your role cannot perform this action" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, repo, session: repo.session };
}

export function authorizeMerchantRead(): Promise<MerchantAuthResult> {
  return authorizeMerchant(...MERCHANT_READ_ROLES);
}

export function authorizeMerchantWrite(): Promise<MerchantAuthResult> {
  return authorizeMerchant(...MERCHANT_WRITE_ROLES);
}
