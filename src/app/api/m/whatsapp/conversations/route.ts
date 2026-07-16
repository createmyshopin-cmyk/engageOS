import { NextRequest, NextResponse } from "next/server";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getWacrmForBusiness } from "@/lib/wacrm/adapter";
import { WacrmApiError } from "@/lib/wacrm/client";

export const runtime = "nodejs";

/** Inbox tab — conversations read live from wacrm (never duplicated). */
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
  const status = url.searchParams.get("status") ?? undefined;
  try {
    const page = await tenant.client.listConversations({
      status: status && ["open", "pending", "closed"].includes(status) ? status : undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: 30,
    });
    return NextResponse.json({
      ok: true,
      conversations: page.data,
      nextCursor: page.next_cursor,
    });
  } catch (err) {
    console.error("wacrm conversations error:", err);
    const msg = err instanceof WacrmApiError ? err.message : "Failed to load inbox";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
