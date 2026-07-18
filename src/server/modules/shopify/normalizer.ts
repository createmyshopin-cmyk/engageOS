import "server-only";

/**
 * Normalizes a raw Shopify order webhook payload into the compact shape the
 * `shopify_ingest_order` RPC expects. Isolating this mapping means the SQL
 * ingestion contract never depends on Shopify's sprawling payload, and payload
 * drift is absorbed in one place. Only fields we actually use are extracted;
 * the full original is preserved under `raw` for future needs.
 */

interface RawLineItem {
  id?: number | string;
  product_id?: number | string;
  title?: string;
  sku?: string;
  quantity?: number;
  price?: string;
  total_discount?: string;
}

interface RawShopifyOrder {
  id?: number | string;
  name?: string;
  order_number?: number | string;
  financial_status?: string;
  fulfillment_status?: string | null;
  currency?: string;
  subtotal_price?: string;
  total_tax?: string;
  total_discounts?: string;
  total_price?: string;
  created_at?: string;
  phone?: string | null;
  email?: string | null;
  customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string | null;
    email?: string | null;
  } | null;
  billing_address?: { phone?: string | null } | null;
  shipping_address?: { phone?: string | null } | null;
  line_items?: RawLineItem[];
}

export interface NormalizedOrder {
  shopify_order_id: string | null;
  order_number: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  currency: string | null;
  subtotal: string | null;
  total_tax: string | null;
  total_discount: string | null;
  total_price: string | null;
  placed_at: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  items: Array<{
    shopify_line_id: string | null;
    shopify_product_id: string | null;
    title: string | null;
    sku: string | null;
    quantity: number;
    price: string;
    total_discount: string;
  }>;
  raw: Record<string, unknown>;
}

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

/** Best-effort customer phone from the several places Shopify may put it. */
function extractPhone(o: RawShopifyOrder): string | null {
  return (
    str(o.phone) ??
    str(o.customer?.phone) ??
    str(o.billing_address?.phone) ??
    str(o.shipping_address?.phone)
  );
}

export function normalizeShopifyOrder(payload: unknown): NormalizedOrder {
  const o = (payload ?? {}) as RawShopifyOrder;
  const name = [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ").trim();

  return {
    shopify_order_id: str(o.id),
    order_number: str(o.name) ?? str(o.order_number),
    financial_status: str(o.financial_status),
    fulfillment_status: str(o.fulfillment_status),
    currency: str(o.currency),
    subtotal: str(o.subtotal_price),
    total_tax: str(o.total_tax),
    total_discount: str(o.total_discounts),
    total_price: str(o.total_price),
    placed_at: str(o.created_at),
    customer_name: name || null,
    customer_phone: extractPhone(o),
    customer_email: str(o.email) ?? str(o.customer?.email),
    items: (o.line_items ?? []).map((li) => ({
      shopify_line_id: str(li.id),
      shopify_product_id: str(li.product_id),
      title: str(li.title),
      sku: str(li.sku),
      quantity: typeof li.quantity === "number" ? li.quantity : 1,
      price: str(li.price) ?? "0",
      total_discount: str(li.total_discount) ?? "0",
    })),
    raw: (payload ?? {}) as Record<string, unknown>,
  };
}
