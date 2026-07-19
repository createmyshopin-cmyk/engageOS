export const ZAPIER_EVENTS = [
  "customer.registered",
  "customer.scan",
  "scratch.completed",
  "coupon.generated",
  "coupon.redeemed",
] as const;

export type ZapierEvent = (typeof ZAPIER_EVENTS)[number];

export const ZAPIER_EVENT_DESCRIPTIONS: Record<ZapierEvent, string> = {
  "customer.registered": "A customer completed registration for a campaign",
  "customer.scan": "A customer scanned a campaign QR code",
  "scratch.completed": "A customer finished scratching their card",
  "coupon.generated": "A coupon was issued to a customer",
  "coupon.redeemed": "A customer redeemed a coupon in store",
};

export function isZapierEvent(value: unknown): value is ZapierEvent {
  return typeof value === "string" && (ZAPIER_EVENTS as readonly string[]).includes(value);
}

export function normalizeZapierEvent(input: unknown): ZapierEvent | null {
  if (!isZapierEvent(input)) return null;
  return input;
}

/** Sample payload for Zapier field mapping when no real event exists yet. */
export function samplePayloadForEvent(event: ZapierEvent): Record<string, unknown> {
  const base = {
    customer: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Sample Customer",
      phone: "+919876543210",
    },
    campaign: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Summer Scratch Campaign",
      slug: "summer-scratch",
    },
  };

  switch (event) {
    case "customer.registered":
    case "customer.scan":
      return base;
    case "scratch.completed":
      return {
        ...base,
        prize: { name: "10% Off", tier: "bronze" },
      };
    case "coupon.generated":
    case "coupon.redeemed":
      return {
        ...base,
        coupon: {
          id: "00000000-0000-4000-8000-000000000003",
          code: "SUMMER10",
          status: event === "coupon.redeemed" ? "redeemed" : "active",
        },
      };
  }
}
