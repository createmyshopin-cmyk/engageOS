import { NextResponse } from "next/server";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { WatiApiError } from "@/lib/wati/client";
import { getWatiForBusiness } from "@/lib/wati/adapter";

export const runtime = "nodejs";

/** List the tenant's WATI templates so the settings UI can offer a picker. */
export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  try {
    const tenant = await getWatiForBusiness(repo.businessId);
    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: "WATI is not connected" },
        { status: 409 }
      );
    }
    const templates = await tenant.client.getTemplates();
    return NextResponse.json({
      ok: true,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        language: t.language_option?.value ?? null,
        category: t.category ?? null,
      })),
    });
  } catch (err) {
    console.error("wati templates error:", err);
    const status = err instanceof WatiApiError ? 502 : 500;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load templates" },
      { status }
    );
  }
}
