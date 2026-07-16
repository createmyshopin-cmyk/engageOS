import { NextResponse } from "next/server";
import { getAllCustomers } from "@/lib/db/merchant";
import { getTenantRepository } from "@/lib/db/tenant-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Escape a CSV field per RFC 4180. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Customer CSV export — tenant scoped to the authenticated merchant session.
 * The business is resolved ONLY from the session, never from the URL.
 */
export async function GET(): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const business = await repo.getBusiness<{ slug: string }>("slug");

    const customers = await getAllCustomers(repo.businessId);

    const rows = ["Name,Phone,Registered On"];
    for (const c of customers) {
      rows.push(
        [
          csvField(c.name),
          csvField(c.phone),
          new Date(c.created_at).toISOString().slice(0, 10),
        ].join(",")
      );
    }
    // BOM so Excel opens Malayalam names as UTF-8 correctly.
    const body = "﻿" + rows.join("\r\n") + "\r\n";

    const date = new Date().toISOString().slice(0, 10);
    const filename = `${business?.slug ?? "customers"}-customers-${date}.csv`;

    // Track the export as an immutable campaign event (tenant-scoped, no
    // campaign). Best-effort — never blocks the download.
    await repo.recordEvent("customer.export", null, {
      format: "csv",
      rowCount: customers.length,
    });

    return new NextResponse(body, {
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
