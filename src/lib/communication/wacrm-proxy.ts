import "server-only";

import { NextResponse } from "next/server";
import { getWacrmForBusiness } from "@/lib/wacrm/adapter";
import { WacrmApiError } from "@/lib/wacrm/client";

export async function requireWacrmTenant(businessId: string) {
  const tenant = await getWacrmForBusiness(businessId);
  if (!tenant) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Connect WACRM in Integrations to use Communication." },
        { status: 409 }
      ),
    };
  }
  return { ok: true as const, tenant };
}

export function wacrmErrorResponse(err: unknown): NextResponse {
  if (err instanceof WacrmApiError) {
    const status = err.status >= 400 && err.status < 600 ? err.status : 502;
    return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status });
  }
  console.error("wacrm proxy error:", err);
  return NextResponse.json(
    { ok: false, error: "Communication request failed" },
    { status: 500 }
  );
}
