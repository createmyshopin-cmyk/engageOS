import "server-only";

/**
 * Order DTOs — the wire shapes for the merchant orders read model. Decoupled
 * from the DB row: internal columns (raw jsonb, shopify_order_id, tax/discount
 * breakdown) stay server-side; the list is a lightweight header projection.
 */

export interface OrderListItemDTO {
  id: string;
  orderNumber: string | null;
  source: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  currency: string;
  totalPrice: number;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  placedAt: string;
}

/**
 * Row shape selected from the orders table (tenant-scoped), with the customer
 * name pulled via an embedded select. Supabase returns an embedded to-one FK as
 * either an object or (typed) an array; the transformer normalizes both.
 */
export interface OrderListRow {
  id: string;
  order_number: string | null;
  source: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  currency: string;
  total_price: number | string | null;
  customer_id: string | null;
  customer_phone: string | null;
  placed_at: string;
  customers?: { name: string | null } | { name: string | null }[] | null;
}

function embeddedName(rel: OrderListRow["customers"]): string | null {
  if (!rel) return null;
  const one = Array.isArray(rel) ? rel[0] : rel;
  return one?.name ?? null;
}

export function toOrderListItemDTO(row: OrderListRow): OrderListItemDTO {
  return {
    id: row.id,
    orderNumber: row.order_number,
    source: row.source,
    financialStatus: row.financial_status,
    fulfillmentStatus: row.fulfillment_status,
    currency: row.currency,
    totalPrice: Number(row.total_price) || 0,
    customerId: row.customer_id,
    customerName: embeddedName(row.customers),
    customerPhone: row.customer_phone,
    placedAt: row.placed_at,
  };
}
