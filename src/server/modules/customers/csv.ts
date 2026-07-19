import { parsePhoneForExport, spreadsheetTextValue } from "@/lib/phone-export";

/** Escape a CSV field per RFC 4180. */
export function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface CustomerExportRow {
  name: string | null;
  phone: string;
  email: string | null;
  createdAt: string;
  latestCode: string | null;
  latestPrizeName: string | null;
  rewardCount: number;
}

const CSV_HEADER =
  "Name,Mobile,Phone (+91),WhatsApp,Email,Joined On,Latest Coupon Code,Latest Prize,Total Rewards";

function phoneColumns(rawPhone: string): {
  mobile: string;
  e164: string;
  whatsapp: string;
} {
  const parsed = parsePhoneForExport(rawPhone);
  if (parsed) {
    return {
      mobile: spreadsheetTextValue(parsed.mobile10),
      e164: spreadsheetTextValue(parsed.e164),
      whatsapp: spreadsheetTextValue(parsed.whatsapp),
    };
  }
  // Unrecognized shape — still export as text so Excel does not corrupt it.
  const fallback = spreadsheetTextValue(rawPhone.trim());
  return { mobile: fallback, e164: fallback, whatsapp: "" };
}

export function buildCustomersCsv(rows: CustomerExportRow[]): string {
  const lines = rows.map((r) => {
    const phones = phoneColumns(r.phone);
    return [
      csvField(r.name ?? ""),
      csvField(phones.mobile),
      csvField(phones.e164),
      csvField(phones.whatsapp),
      csvField(r.email ?? ""),
      new Date(r.createdAt).toISOString().slice(0, 10),
      csvField(r.latestCode ?? ""),
      csvField(r.latestPrizeName ?? ""),
      String(r.rewardCount),
    ].join(",");
  });
  return "\uFEFF" + [CSV_HEADER, ...lines].join("\r\n") + "\r\n";
}
