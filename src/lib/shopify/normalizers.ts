import "server-only";

/**
 * Normalizers: map sprawling Shopify Admin API payloads to the compact jsonb
 * shapes the upsert RPCs expect. Isolating this mapping means the SQL contract
 * never depends on Shopify's payload drift — absorbed here in one place. Only
 * fields we use are extracted; the full original is preserved under `raw`.
 *
 * This mirrors normalizer.ts (orders) for the resources the sync engine adds.
 */

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

type Raw = Record<string, unknown>;

/**
 * Coerce a Shopify phone into the strict Indian E.164 the CDP `customers` table
 * enforces (`^\+91[6-9]\d{9}$`). Shopify returns phones in mixed shapes — bare
 * 10-digit locals, `91…`, `0…`, with spaces/dashes — so we mirror the same
 * accept-and-normalize rules as `phoneSchema` in validation.ts. Returns null for
 * anything that can't be normalized (foreign numbers, landlines, junk): the
 * customer upsert RPC then skips it exactly like an email-only customer, instead
 * of throwing a check-constraint violation that would fail the whole page.
 */
function normalizeIndianPhone(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.replace(/[\s-]/g, "");
  if (/^\+91[6-9]\d{9}$/.test(v)) return v;
  if (/^91[6-9]\d{9}$/.test(v)) return `+${v}`;
  if (/^0[6-9]\d{9}$/.test(v)) return `+91${v.slice(1)}`;
  if (/^[6-9]\d{9}$/.test(v)) return `+91${v}`;
  return null;
}

export function normalizeProduct(p: Raw): Record<string, unknown> {
  const variants = Array.isArray(p.variants) ? (p.variants as Raw[]) : [];
  const firstPrice = variants.length > 0 ? str(variants[0].price) : null;
  const image = (p.image as Raw | null)?.src ?? (Array.isArray(p.images) && (p.images as Raw[])[0]?.src);
  return {
    shopify_product_id: str(p.id),
    title: str(p.title),
    handle: str(p.handle),
    product_type: str(p.product_type),
    vendor: str(p.vendor),
    status: str(p.status),
    price: firstPrice,
    image_url: str(image),
    tags:
      typeof p.tags === "string" && p.tags.length > 0
        ? (p.tags as string).split(",").map((t) => t.trim()).filter(Boolean)
        : [],
    raw: p,
  };
}

export function normalizeCollection(c: Raw): Record<string, unknown> {
  // Shopify has both custom_collections and smart_collections; the caller tags
  // which endpoint it came from via `collection_type` on the raw object.
  return {
    shopify_collection_id: str(c.id),
    title: str(c.title),
    handle: str(c.handle),
    collection_type: str(c.collection_type),
    products_count: typeof c.products_count === "number" ? c.products_count : null,
    image_url: str((c.image as Raw | null)?.src),
    raw: c,
  };
}

export function normalizeDiscount(d: Raw): Record<string, unknown> {
  // From price_rules: value/value_type live on the rule; the code lives on the
  // associated discount_code. The caller may merge a code onto the raw object.
  return {
    shopify_discount_id: str(d.id),
    code: str(d.code) ?? str(d.title),
    title: str(d.title),
    value_type: str(d.value_type),
    value: d.value != null ? String(Math.abs(Number(d.value))) : null,
    status: str(d.status),
    starts_at: str(d.starts_at),
    ends_at: str(d.ends_at),
    usage_limit: typeof d.usage_limit === "number" ? d.usage_limit : null,
    used_count: typeof d.used_count === "number" ? d.used_count : null,
    raw: d,
  };
}

export function normalizeInventoryLevel(i: Raw): Record<string, unknown> {
  return {
    inventory_item_id: str(i.inventory_item_id),
    location_id: str(i.location_id),
    available: typeof i.available === "number" ? i.available : null,
    shopify_product_id: str(i.product_id),
    sku: str(i.sku),
    raw: i,
  };
}

export function normalizeCustomer(c: Raw): Record<string, unknown> {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  const defaultAddress = c.default_address as Raw | null;
  return {
    shopify_customer_id: str(c.id),
    phone: normalizeIndianPhone(str(c.phone) ?? str(defaultAddress?.phone)),
    email: str(c.email),
    name: name || null,
    raw: c,
  };
}
