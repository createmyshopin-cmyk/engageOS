/** Communication domain events published by EngageOS business modules. */
export const CommunicationEvents = {
  CUSTOMER_CREATED: "customer.created",
  CUSTOMER_REGISTERED: "customer.registered",
  CAMPAIGN_JOINED: "campaign.joined",
  COUPON_GENERATED: "coupon.generated",
  COUPON_REDEEMED: "coupon.redeemed",
  REWARD_WON: "reward.won",
  REWARD_REDEEMED: "reward.redeemed",
  LOYALTY_POINTS_ADDED: "loyalty.points_added",
  TIER_UPGRADED: "tier.upgraded",
  PURCHASE_COMPLETED: "purchase.completed",
  BIRTHDAY_TODAY: "birthday.today",
  CUSTOMER_INACTIVE: "customer.inactive",
} as const;

export type CommunicationEventType =
  (typeof CommunicationEvents)[keyof typeof CommunicationEvents];
