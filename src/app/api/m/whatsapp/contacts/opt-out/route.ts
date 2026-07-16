import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { syncOptOut } from "@/lib/wacrm/sync";

export const runtime = "nodejs";

const schema = z.object({
  phone: z.string().trim().regex(/^\+[0-9]{8,15}$/, "Enter an E.164 phone number"),
  optOut: z.boolean(),
});

/**
 * Opt a customer out of (or back into) WhatsApp messaging. Flips the local
 * suppression flag and tags the wacrm contact 'opted-out'.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const result = await syncOptOut(repo.businessId, parsed.data.phone, parsed.data.optOut);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
    }
    await repo.audit("whatsapp.opt_out", "customer", null, {
      phone: parsed.data.phone,
      optOut: parsed.data.optOut,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("opt-out error:", err);
    return NextResponse.json({ ok: false, error: "Failed to update opt-out" }, { status: 500 });
  }
}
