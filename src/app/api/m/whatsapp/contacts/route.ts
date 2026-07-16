import { NextRequest, NextResponse } from "next/server";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getWacrmForBusiness } from "@/lib/wacrm/adapter";
import { WacrmApiError } from "@/lib/wacrm/client";

export const runtime = "nodejs";

/**
 * Contacts tab — a pass-through read of the tenant's wacrm contacts.
 * EngageOS never stores these rows; wacrm is the CRM of record.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const tenant = await getWacrmForBusiness(repo.businessId);
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "wacrm is not connected" }, { status: 409 });
  }

  const url = req.nextUrl;
  try {
    const page = await tenant.client.listContacts({
      search: url.searchParams.get("search") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: 50,
    });
    return NextResponse.json({ ok: true, contacts: page.data, nextCursor: page.next_cursor });
  } catch (err) {
    console.error("wacrm contacts error:", err);
    const msg = err instanceof WacrmApiError ? err.message : "Failed to load contacts";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
