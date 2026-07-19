function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export interface WinnerExportRow {
  customerName: string;
  customerPhone: string;
  prizeName: string;
  prizeType: string;
  campaignName: string;
  couponCode: string;
  wonAt: string;
}

export function buildWinnersCsv(rows: WinnerExportRow[]): string {
  const header = [
    "Customer",
    "Phone",
    "Prize",
    "Prize Type",
    "Campaign",
    "Coupon Code",
    "Won At",
  ];
  const lines = rows.map((r) =>
    [
      csvEscape(r.customerName),
      csvEscape(r.customerPhone),
      csvEscape(r.prizeName),
      csvEscape(r.prizeType),
      csvEscape(r.campaignName),
      csvEscape(r.couponCode),
      csvEscape(r.wonAt),
    ].join(",")
  );
  return [header.join(","), ...lines].join("\n");
}
