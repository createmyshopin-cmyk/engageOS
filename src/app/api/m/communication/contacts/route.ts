import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { requireWacrmTenant, wacrmErrorResponse } from "@/lib/communication/wacrm-proxy";

export const runtime = "nodejs";

const createSchema = z.object({
  phone: z.string().trim().min(8),
  name: z.string().trim().max(120).optional(),
  email: z.string().email().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;

  const wacrm = await requireWacrmTenant(auth.repo.businessId);
  if (!wacrm.ok) return wacrm.response;

  const { searchParams } = req.nextUrl;
  try {
    const result = await wacrm.tenant.client.listContacts({
      limit: Number(searchParams.get("limit") ?? 50),
      cursor: searchParams.get("cursor") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;

  const wacrm = await requireWacrmTenant(auth.repo.businessId);
  if (!wacrm.ok) return wacrm.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const contact = await wacrm.tenant.client.upsertContact({
      phone: parsed.data.phone,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      tags: ["engageos", ...(parsed.data.tags ?? [])],
    });
    return NextResponse.json({ ok: true, contact });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}
