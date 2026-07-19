/** Shared helpers for filling sparse daily-activity RPC rows into continuous date series. */

export interface DailyActivityPoint {
  day: string;
  registrations: number;
  scratches: number;
  coupons: number;
  redemptions: number;
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** Fill missing days with zeros so charts always have a continuous series. */
export function fillDailySeries(rows: DailyActivityPoint[], days: number): DailyActivityPoint[] {
  const map = new Map(rows.map((r) => [r.day, r]));
  const out: DailyActivityPoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(
      map.get(key) ?? {
        day: key,
        registrations: 0,
        scratches: 0,
        coupons: 0,
        redemptions: 0,
      }
    );
  }
  return out;
}
