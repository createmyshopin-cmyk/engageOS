import "server-only";

/**
 * Product DTOs — the wire shapes for the merchant products read model. The
 * `raw` jsonb and Shopify-internal ids stay server-side; the list is a light
 * catalog projection.
 */

export interface ProductListItemDTO {
  id: string;
  title: string | null;
  handle: string | null;
  productType: string | null;
  vendor: string | null;
  status: string | null;
  price: number | null;
  imageUrl: string | null;
  createdAt: string;
}

/** Row shape selected from shopify_products (tenant-scoped). */
export interface ProductListRow {
  id: string;
  title: string | null;
  handle: string | null;
  product_type: string | null;
  vendor: string | null;
  status: string | null;
  price: number | string | null;
  image_url: string | null;
  created_at: string;
}

export function toProductListItemDTO(row: ProductListRow): ProductListItemDTO {
  return {
    id: row.id,
    title: row.title,
    handle: row.handle,
    productType: row.product_type,
    vendor: row.vendor,
    status: row.status,
    price: row.price == null ? null : Number(row.price) || 0,
    imageUrl: row.image_url,
    createdAt: row.created_at,
  };
}
