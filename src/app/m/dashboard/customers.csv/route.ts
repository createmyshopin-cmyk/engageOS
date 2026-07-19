import { NextResponse, type NextRequest } from "next/server";
import { getAllCustomers } from "@/lib/db/merchant";
import { authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { buildCustomersCsv } from "@/server/modules/customers/csv";
import { buildCustomersXlsx } from "@/server/modules/customers/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Customer export — tenant scoped to the authenticated merchant session.
 * Supports ?format=csv (default) or ?format=xlsx.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) {
    return new NextResponse("Unauthorized", { status: auth.response.status });
  }
  const { repo } = auth;

  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  try {
    const business = await repo.getBusiness<{ slug: string }>("slug");
    const customers = await getAllCustomers(repo.businessId);

    const rows = customers.map((c) => ({
      name: c.name,
      phone: c.phone,
      email: null,
      createdAt: c.created_at,
      latestCode: null,
      latestPrizeName: null,
      rewardCount: 0,
    }));

    const date = new Date().toISOString().slice(0, 10);
    const slug = business?.slug ?? "customers";
    const filename =
      format === "xlsx"
        ? `${slug}-customers-${date}.xlsx`
        : `${slug}-customers-${date}.csv`;

    await repo.recordEvent("customer.export", null, {
      format,
      rowCount: customers.length,
      source: "dashboard_csv",
    }).catch(() => {});

    if (format === "xlsx") {
      const body = buildCustomersXlsx(rows);
      return new NextResponse(new Uint8Array(body), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const csv = buildCustomersCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("customers.csv error:", err);
    return new NextResponse("Something went wrong", { status: 500 });
  }
}
