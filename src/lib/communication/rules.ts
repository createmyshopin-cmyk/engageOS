import "server-only";

import { adminClient } from "@/lib/db/rpc";

export interface CommunicationRule {
  id: string;
  business_id: string;
  event_type: string;
  enabled: boolean;
  template_name: string | null;
  template_language: string;
}

export const COMMUNICATION_RULE_EVENT_TYPES = [
  "customer.created",
  "customer.registered",
  "coupon.redeemed",
  "reward.won",
  "reward.redeemed",
  "loyalty.points_added",
  "tier.upgraded",
  "purchase.completed",
  "birthday.today",
  "customer.inactive",
] as const;

export type ConfigurableCommunicationEvent =
  (typeof COMMUNICATION_RULE_EVENT_TYPES)[number];

const RULE_LABELS: Record<string, string> = {
  "customer.created": "New customer (API)",
  "customer.registered": "Campaign registration",
  "coupon.redeemed": "Coupon redeemed",
  "reward.won": "Prize won",
  "reward.redeemed": "Reward redeemed",
  "loyalty.points_added": "Points earned",
  "tier.upgraded": "Tier upgraded",
  "purchase.completed": "Order placed",
  "birthday.today": "Birthday",
  "customer.inactive": "Win-back (inactive)",
};

export function communicationRuleLabel(eventType: string): string {
  return RULE_LABELS[eventType] ?? eventType;
}

export async function listCommunicationRules(
  businessId: string
): Promise<CommunicationRule[]> {
  const { data, error } = await adminClient()
    .from("communication_rules")
    .select("*")
    .eq("business_id", businessId)
    .order("event_type");
  if (error) throw new Error(`listCommunicationRules failed: ${error.message}`);
  return (data as CommunicationRule[]) ?? [];
}

export async function upsertCommunicationRule(
  businessId: string,
  eventType: string,
  patch: {
    enabled?: boolean;
    templateName?: string | null;
    templateLanguage?: string;
  }
): Promise<void> {
  const { error } = await adminClient()
    .from("communication_rules")
    .upsert(
      {
        business_id: businessId,
        event_type: eventType,
        enabled: patch.enabled ?? false,
        template_name: patch.templateName ?? null,
        template_language: patch.templateLanguage ?? "en",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id,event_type" }
    );
  if (error) throw new Error(`upsertCommunicationRule failed: ${error.message}`);
}

export async function getCommunicationRule(
  businessId: string,
  eventType: string
): Promise<CommunicationRule | null> {
  const { data, error } = await adminClient()
    .from("communication_rules")
    .select("*")
    .eq("business_id", businessId)
    .eq("event_type", eventType)
    .maybeSingle();
  if (error) throw new Error(`getCommunicationRule failed: ${error.message}`);
  return (data as CommunicationRule | null) ?? null;
}
