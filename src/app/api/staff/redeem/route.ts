import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { redeemRequestSchema } from "@/lib/validation";
import { redeemCoupon } from "@/lib/db/rpc";
import { getStaffSession } from "@/lib/staff-session";
import { syncRedeemToWacrm } from "@/lib/wacrm/sync";
import type { RedeemResult } from "@/lib/types";

export const runtime = "nodejs";

type ApiResponse =
  | { ok: true; result: RedeemResult }
  | { ok: false; error: string };

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Session expired. Please log in again." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = redeemRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Enter a code like ONAM-AB12" },
      { status: 400 }
    );
  }

  try {
    const result = await redeemCoupon({
      businessId: session.businessId,
      code: parsed.data.code,
    });

    // Tag the wacrm contact 'redeemed' after the response — CRM segments
    // and automations react; the staff redemption flow is never blocked.
    after(() =>
      syncRedeemToWacrm({
        businessId: session.businessId,
        code: parsed.data.code,
        result,
      })
    );

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("redeem error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
