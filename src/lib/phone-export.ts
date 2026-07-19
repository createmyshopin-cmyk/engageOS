/**
 * Phone formatting for CSV / Excel exports.
 * Normalizes Indian mobiles to consistent columns merchants expect:
 *   - Mobile: 10-digit local (9876543210) — Excel-safe as text
 *   - Phone (+91): E.164 (+919876543210)
 *   - WhatsApp: country code without + (919876543210) — bulk messaging tools
 */

export interface ExportedPhone {
  /** 10-digit Indian mobile without country code. */
  mobile10: string;
  /** E.164 (+91…). */
  e164: string;
  /** Digits for WhatsApp bulk tools (91 + 10 digits). */
  whatsapp: string;
}

/** Normalize common Indian phone shapes to export columns. */
export function parsePhoneForExport(raw: string | null | undefined): ExportedPhone | null {
  if (!raw) return null;
  const v = raw.trim().replace(/[\s-]/g, "");
  if (!v) return null;

  let e164: string | null = null;
  if (/^\+91[6-9]\d{9}$/.test(v)) e164 = v;
  else if (/^91[6-9]\d{9}$/.test(v)) e164 = `+${v}`;
  else if (/^0[6-9]\d{9}$/.test(v)) e164 = `+91${v.slice(1)}`;
  else if (/^[6-9]\d{9}$/.test(v)) e164 = `+91${v}`;

  if (!e164) return null;
  const mobile10 = e164.slice(3);
  return { mobile10, e164, whatsapp: `91${mobile10}` };
}

/**
 * Prefix with a tab so Excel opens the cell as text (avoids scientific notation
 * and stripping leading zeros). Safe inside a quoted CSV field.
 */
export function spreadsheetTextValue(value: string): string {
  if (!value) return "";
  return `\t${value}`;
}
