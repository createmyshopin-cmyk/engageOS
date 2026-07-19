import * as XLSX from "xlsx";
import { parsePhoneForExport } from "@/lib/phone-export";
import type { CustomerExportRow } from "@/server/modules/customers/csv";

function toSheetRow(r: CustomerExportRow): Record<string, string | number> {
  const parsed = parsePhoneForExport(r.phone);
  return {
    Name: r.name ?? "",
    Mobile: parsed?.mobile10 ?? r.phone.trim(),
    "Phone (+91)": parsed?.e164 ?? "",
    WhatsApp: parsed?.whatsapp ?? "",
    Email: r.email ?? "",
    "Joined On": new Date(r.createdAt).toISOString().slice(0, 10),
    "Latest Coupon Code": r.latestCode ?? "",
    "Latest Prize": r.latestPrizeName ?? "",
    "Total Rewards": r.rewardCount,
  };
}

/** Build an .xlsx workbook buffer with phone columns stored as plain text. */
export function buildCustomersXlsx(rows: CustomerExportRow[]): Buffer {
  const sheetRows = rows.map(toSheetRow);
  const worksheet = XLSX.utils.json_to_sheet(sheetRows);

  // Force phone-related columns to string cells so Excel never coerces to numbers.
  const phoneHeaders = new Set(["Mobile", "Phone (+91)", "WhatsApp"]);
  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
    const cell = worksheet[addr];
    headers[c] = cell ? String(cell.v) : "";
  }

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = headers[c];
      if (!phoneHeaders.has(header)) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[addr];
      if (!cell) continue;
      cell.t = "s";
      cell.v = String(cell.v ?? "");
      cell.z = "@";
    }
  }

  worksheet["!cols"] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 28 },
    { wch: 12 },
    { wch: 20 },
    { wch: 22 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
  return Buffer.from(
    XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellStyles: true })
  );
}
