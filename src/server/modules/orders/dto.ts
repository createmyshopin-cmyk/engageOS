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
  totalDiscount: number | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  placedAt: string;
  discountCode: string | null;
  campaignId: string | null;
  campaignName: string | null;
  hasCampaignCoupon: boolean;
}

export interface OrderLineItemDTO {
  id: string;
  title: string | null;
  sku: string | null;
  quantity: number;
  price: number;
  lineTotal: number;
}

export interface OrderDetailDTO extends OrderListItemDTO {
  subtotal: number | null;
  totalTax: number | null;
  items: OrderLineItemDTO[];
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
  total_discount: number | string | null;
  customer_id: string | null;
  customer_phone: string | null;
  placed_at: string;
  discount_code: string | null;
  campaign_id: string | null;
  coupon_id: string | null;
  customers?: { name: string | null } | { name: string | null }[] | null;
  campaigns?: { name: string | null } | { name: string | null }[] | null;
}

export interface OrderDetailRow extends OrderListRow {
  subtotal: number | string | null;
  total_tax: number | string | null;
  order_items?: OrderLineItemRow[] | null;
}

interface OrderLineItemRow {
  id: string;
  title: string | null;
  sku: string | null;
  quantity: number | string | null;
  price: number | string | null;
  total_discount: number | string | null;
}

function embeddedName(rel: { name: string | null } | { name: string | null }[] | null | undefined): string | null {
  if (!rel) return null;
  const one = Array.isArray(rel) ? rel[0] : rel;
  return one?.name ?? null;
}

function num(v: number | string | null | undefined): number {
  return Number(v) || 0;
}

function toLineItemDTO(row: OrderLineItemRow): OrderLineItemDTO {
  const qty = Number(row.quantity) || 0;
  const price = num(row.price);
  const lineDiscount = num(row.total_discount);
  return {
    id: row.id,
    title: row.title,
    sku: row.sku,
    quantity: qty,
    price,
    lineTotal: Math.max(0, qty * price - lineDiscount),
  };
}

export function toOrderListItemDTO(row: OrderListRow): OrderListItemDTO {
  return {
    id: row.id,
    orderNumber: row.order_number,
    source: row.source,
    financialStatus: row.financial_status,
    fulfillmentStatus: row.fulfillment_status,
    currency: row.currency,
    totalPrice: num(row.total_price),
    totalDiscount: row.total_discount == null ? null : num(row.total_discount),
    customerId: row.customer_id,
    customerName: embeddedName(row.customers),
    customerPhone: row.customer_phone,
    placedAt: row.placed_at,
    discountCode: row.discount_code,
    campaignId: row.campaign_id,
    campaignName: embeddedName(row.campaigns),
    hasCampaignCoupon: row.coupon_id != null,
  };
}

export function toOrderDetailDTO(row: OrderDetailRow): OrderDetailDTO {
  return {
    ...toOrderListItemDTO(row),
    subtotal: row.subtotal == null ? null : num(row.subtotal),
    totalTax: row.total_tax == null ? null : num(row.total_tax),
    items: (row.order_items ?? []).map(toLineItemDTO),
  };
}
