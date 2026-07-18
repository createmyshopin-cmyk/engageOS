import "server-only";

/** Wire shape of a universal event returned to clients. */
export interface EventDTO {
  id: string;
  name: string;
  category: string;
  source: string;
  customerId: string | null;
  campaignId: string | null;
  orderId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface EventRow {
  id: string;
  event_name: string;
  category: string;
  source: string;
  customer_id: string | null;
  campaign_id: string | null;
  order_id: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
}

export function toEventDTO(row: EventRow): EventDTO {
  return {
    id: row.id,
    name: row.event_name,
    category: row.category,
    source: row.source,
    customerId: row.customer_id,
    campaignId: row.campaign_id,
    orderId: row.order_id,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}
