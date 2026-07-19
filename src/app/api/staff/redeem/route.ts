import { NextRequest, NextResponse } from "next/server";
import { redeemRequestSchema } from "@/lib/validation";
import { redeemCoupon } from "@/lib/db/rpc";
import { getStaffSession } from "@/lib/staff-session";
import { clientIpFromHeaders } from "@/lib/ip";
import { checkRateLimit } from "@/lib/rate-limit";
import type { RedeemResult } from "@/lib/types";

export const runtime = "nodejs";

type ApiResponse =
  | { ok: true; result: RedeemResult }
  | { ok: false; error: string };

/** Brute-force guard after staff session is established. */
const REDEEM_RATE_MAX = 30;

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Session expired. Please log in again." },
      { status: 401 }
    );
  }

  const ip = clientIpFromHeaders(req.headers);
  try {
    const allowed = await checkRateLimit(
      `redeem:${session.businessId}:${ip}`,
      REDEEM_RATE_MAX
    );
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Slow down and try again." },
        { status: 429 }
      );
    }
  } catch (err) {
    console.error("redeem rate limit error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
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

    if (result.status === "redeemed") {
      // WhatsApp side-effects are handled by WATI play/coupon dispatch only.
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("redeem API error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
