import { NextRequest, NextResponse } from "next/server";
import { staffLoginSchema } from "@/lib/validation";
import { adminClient } from "@/lib/db/rpc";
import { createStaffSession, verifyPin, isLegacyPinHash, hashPin } from "@/lib/staff-session";
import { clientIpFromHeaders } from "@/lib/ip";
import { checkRateLimit } from "@/lib/rate-limit";
import type { Business } from "@/lib/types";

export const runtime = "nodejs";

type ApiResponse =
  | { ok: true; businessName: string }
  | { ok: false; error: string };

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = staffLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Enter your store name and PIN" },
      { status: 400 }
    );
  }

  try {
    const supabase = adminClient();
    const ip = clientIpFromHeaders(req.headers);

    // Brute-force guard: per-IP and per-store limits.
    const [ipAllowed, storeAllowed] = await Promise.all([
      checkRateLimit(`stafflogin:ip:${ip}`, 10),
      checkRateLimit(`stafflogin:store:${parsed.data.businessSlug}`, 15),
    ]);
    if (!ipAllowed || !storeAllowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Try again in an hour." },
        { status: 429 }
      );
    }

    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, staff_pin, active")
      .eq("slug", parsed.data.businessSlug)
      .maybeSingle<Pick<Business, "id" | "name" | "staff_pin" | "active">>();
    if (error) throw new Error(`business lookup failed: ${error.message}`);

    if (!data || !data.active || !(await verifyPin(parsed.data.pin, data.staff_pin))) {
      // Identical message for unknown store and wrong PIN — no enumeration.
      return NextResponse.json(
        { ok: false, error: "Wrong store name or PIN" },
        { status: 401 }
      );
    }

    // Transparently upgrade legacy SHA-256 PIN hashes to Argon2id on the
    // next successful login, so old accounts migrate without merchant action.
    if (isLegacyPinHash(data.staff_pin)) {
      try {
        const upgraded = await hashPin(parsed.data.pin);
        await supabase.from("businesses").update({ staff_pin: upgraded }).eq("id", data.id);
      } catch (err) {
        console.error("staff PIN rehash failed:", err);
      }
    }

    await createStaffSession(data.id, data.name);
    return NextResponse.json({ ok: true, businessName: data.name });
  } catch (err) {
    console.error("staff login error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
