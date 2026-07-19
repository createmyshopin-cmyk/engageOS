import type { CommunicationEventType } from "@/lib/communication/events";

/**
 * Priority tiers for the communication outbox (0–100).
 * Higher values are claimed first by communication_claim_next_job.
 */
export const CommunicationPriority = {
  CRITICAL: 90,
  HIGH: 75,
  NORMAL: 50,
  LOW: 30,
  BULK: 20,
} as const;

const EVENT_PRIORITY: Partial<Record<CommunicationEventType, number>> = {
  "coupon.redeemed": CommunicationPriority.CRITICAL,
  "reward.won": CommunicationPriority.HIGH,
  "coupon.generated": CommunicationPriority.HIGH,
  "customer.created": CommunicationPriority.HIGH,
  "customer.registered": CommunicationPriority.HIGH,
  "campaign.joined": CommunicationPriority.NORMAL,
  "reward.redeemed": CommunicationPriority.HIGH,
  "loyalty.points_added": CommunicationPriority.NORMAL,
  "tier.upgraded": CommunicationPriority.HIGH,
  "purchase.completed": CommunicationPriority.NORMAL,
  "birthday.today": CommunicationPriority.LOW,
  "customer.inactive": CommunicationPriority.BULK,
};

export function resolveCommunicationPriority(
  eventType: CommunicationEventType | string,
  override?: number
): number {
  if (override != null) {
    return Math.max(0, Math.min(100, Math.round(override)));
  }
  return EVENT_PRIORITY[eventType as CommunicationEventType] ?? CommunicationPriority.NORMAL;
}
