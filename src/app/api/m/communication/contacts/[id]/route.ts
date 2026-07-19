import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { requireWacrmTenant, wacrmErrorResponse } from "@/lib/communication/wacrm-proxy";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.string().email().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const wacrm = await requireWacrmTenant(auth.repo.businessId);
  if (!wacrm.ok) return wacrm.response;

  try {
    const contact = await wacrm.tenant.client.getContact(id);
    return NextResponse.json({ ok: true, contact });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const wacrm = await requireWacrmTenant(auth.repo.businessId);
  if (!wacrm.ok) return wacrm.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const contact = await wacrm.tenant.client.patchContact(id, parsed.data);
    return NextResponse.json({ ok: true, contact });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}
