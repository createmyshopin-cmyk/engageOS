/**
 * Asia/Kolkata calendar-date helpers for merchant dashboards.
 * Date-only filters (YYYY-MM-DD) are interpreted as IST calendar days.
 */

export const MERCHANT_TZ = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

/** Today's calendar date in IST as YYYY-MM-DD. */
export function todayIstDate(): string {
  return formatIstDate(new Date());
}

/** Yesterday's calendar date in IST as YYYY-MM-DD. */
export function yesterdayIstDate(): string {
  return addIstDays(todayIstDate(), -1);
}

/** Format an instant as YYYY-MM-DD in IST. */
export function formatIstDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: MERCHANT_TZ });
}

/** Add days to an IST calendar date string. */
export function addIstDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/**
 * Convert IST calendar date bounds to timestamptz strings for Postgres.
 * Start = 00:00:00 IST, end = 23:59:59.999 IST on that calendar day.
 */
export function istDateRangeToTimestamps(
  from: string | null,
  to: string | null
): { from: string | null; to: string | null } {
  return {
    from: from ? `${from}T00:00:00.000${IST_OFFSET}` : null,
    to: to ? `${to}T23:59:59.999${IST_OFFSET}` : null,
  };
}
