import "server-only";

/**
 * Shared Shopify types for the sync engine. Kept deliberately small — only the
 * fields the engine reads are typed; the full Shopify payload is always
 * preserved under `raw` when persisted.
 */

/** Resources the sync engine can pull. Mirrors the DB `resource` check. */
export type SyncResource =
  | "customers"
  | "products"
  | "orders"
  | "collections"
  | "inventory"
  | "discounts";

export const SYNC_RESOURCES: readonly SyncResource[] = [
  "customers",
  "products",
  "orders",
  "collections",
  "inventory",
  "discounts",
] as const;

export type SyncMode = "initial" | "incremental" | "manual" | "scheduled";
export type SyncJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** A connected store row (decrypted token stays server-side, never serialized). */
export interface ShopifyShop {
  id: string;
  business_id: string;
  shop_domain: string;
  access_token_enc: string | null;
  scopes: string | null;
  webhook_secret_enc: string | null;
  status: "active" | "paused" | "revoked";
  installed_at: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifySyncJob {
  id: string;
  business_id: string;
  resource: SyncResource | "all";
  mode: SyncMode;
  status: SyncJobStatus;
  cursor: string | null;
  processed: number;
  total: number | null;
  failed: number;
  attempts: number;
  max_attempts: number;
  error: string | null;
  triggered_by: string;
  scheduled_at: string | null;
  next_run_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

/** One page returned by the Admin API client: items + the opaque resume cursor. */
export interface ShopifyPage<T> {
  items: T[];
  nextPageInfo: string | null;
}
