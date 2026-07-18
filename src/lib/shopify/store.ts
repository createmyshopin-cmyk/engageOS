import "server-only";
import { adminClient } from "@/lib/db/rpc";
import type { ShopifyShop, ShopifySyncJob, SyncMode, SyncResource } from "@/lib/shopify/types";

/**
 * Integration-layer persistence for the Shopify sync engine. Every helper is
 * explicitly scoped by business_id so nothing crosses a tenant boundary. Kept
 * OUT of TenantRepository on purpose (same rule as wacrm/store.ts): the core
 * repository stays unmodified; this is service-role-only integration plumbing.
 *
 * The encrypted access token lives in `shopify_shops.access_token_enc` and is
 * NEVER selected into anything that could reach the browser — only the adapter
 * decrypts it, server-side, to build an Admin API client.
 */

// ---------- Shop row ----------

export async function getShop(businessId: string): Promise<ShopifyShop | null> {
  const { data, error } = await adminClient()
    .from("shopify_shops")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`getShop failed: ${error.message}`);
  return (data as ShopifyShop | null) ?? null;
}

export async function getShopByDomain(shopDomain: string): Promise<ShopifyShop | null> {
  const { data, error } = await adminClient()
    .from("shopify_shops")
    .select("*")
    .eq("shop_domain", shopDomain.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`getShopByDomain failed: ${error.message}`);
  return (data as ShopifyShop | null) ?? null;
}

/** Upsert the connected store (one per business). Token must be pre-encrypted. */
export async function upsertShop(
  businessId: string,
  row: {
    shop_domain: string;
    access_token_enc: string;
    scopes?: string | null;
    webhook_secret_enc?: string | null;
    client_id?: string | null;
    client_secret_enc?: string | null;
    token_expires_at?: string | null;
    status?: "active" | "paused" | "revoked";
  }
): Promise<void> {
  const { error } = await adminClient()
    .from("shopify_shops")
    .upsert(
      {
        business_id: businessId,
        shop_domain: row.shop_domain.trim().toLowerCase(),
        access_token_enc: row.access_token_enc,
        scopes: row.scopes ?? null,
        webhook_secret_enc: row.webhook_secret_enc ?? null,
        client_id: row.client_id ?? null,
        client_secret_enc: row.client_secret_enc ?? null,
        token_expires_at: row.token_expires_at ?? null,
        status: row.status ?? "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "business_id" }
    );
  if (error) throw new Error(`upsertShop failed: ${error.message}`);
}

/**
 * Persist a freshly re-exchanged client-credentials access token + its expiry.
 * Used by the refresh path when the cached token has (nearly) expired — the
 * long-lived Client ID/Secret stay put; only the short-lived token rotates.
 */
export async function updateShopAccessToken(
  businessId: string,
  accessTokenEnc: string,
  tokenExpiresAt: string
): Promise<void> {
  const { error } = await adminClient()
    .from("shopify_shops")
    .update({
      access_token_enc: accessTokenEnc,
      token_expires_at: tokenExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("business_id", businessId);
  if (error) throw new Error(`updateShopAccessToken failed: ${error.message}`);
}

export async function setShopStatus(
  businessId: string,
  status: "active" | "paused" | "revoked"
): Promise<void> {
  const { error } = await adminClient()
    .from("shopify_shops")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);
  if (error) throw new Error(`setShopStatus failed: ${error.message}`);
}

export async function deleteShop(businessId: string): Promise<void> {
  const { error } = await adminClient()
    .from("shopify_shops")
    .delete()
    .eq("business_id", businessId);
  if (error) throw new Error(`deleteShop failed: ${error.message}`);
}

// ---------- OAuth state (CSRF nonce) ----------

export async function createOAuthState(
  state: string,
  businessId: string,
  shopDomain: string
): Promise<void> {
  const { error } = await adminClient().from("shopify_oauth_states").insert({
    state,
    business_id: businessId,
    shop_domain: shopDomain.trim().toLowerCase(),
  });
  if (error) throw new Error(`createOAuthState failed: ${error.message}`);
}

/**
 * Consume a state nonce: returns the row if valid + unexpired, deleting it so
 * it can never be replayed. Returns null on unknown/expired state.
 */
export async function consumeOAuthState(
  state: string
): Promise<{ business_id: string; shop_domain: string } | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("shopify_oauth_states")
    .select("business_id, shop_domain, expires_at")
    .eq("state", state)
    .maybeSingle<{ business_id: string; shop_domain: string; expires_at: string }>();
  if (error) throw new Error(`consumeOAuthState failed: ${error.message}`);
  if (!data) return null;

  // Single-use: delete regardless of expiry outcome.
  await admin.from("shopify_oauth_states").delete().eq("state", state);

  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { business_id: data.business_id, shop_domain: data.shop_domain };
}

// ---------- Sync jobs ----------

/**
 * Enqueue a sync job idempotently. The DB RPC guarantees at most one active
 * job per (business, resource) and returns the existing one on conflict.
 */
export async function createSyncJob(
  businessId: string,
  resource: SyncResource | "all",
  opts: { mode?: SyncMode; triggeredBy?: string; scheduledAt?: string | null } = {}
): Promise<string | null> {
  const { data, error } = await adminClient().rpc("shopify_create_sync_job", {
    p_business_id: businessId,
    p_resource: resource,
    p_mode: opts.mode ?? "manual",
    p_triggered_by: opts.triggeredBy ?? "system",
    p_scheduled_at: opts.scheduledAt ?? null,
  });
  if (error) throw new Error(`createSyncJob failed: ${error.message}`);
  return (data as string | null) ?? null;
}

export async function getSyncJob(
  businessId: string,
  jobId: string
): Promise<ShopifySyncJob | null> {
  const { data, error } = await adminClient()
    .from("shopify_sync_jobs")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(`getSyncJob failed: ${error.message}`);
  return (data as ShopifySyncJob | null) ?? null;
}

/**
 * Atomically claim a queued job (queued→running). Returns true only if THIS
 * caller won the claim; false means another worker/the scheduler already took
 * it, and the caller must not process it (prevents double cursor-advance).
 */
export async function startSyncJob(businessId: string, jobId: string): Promise<boolean> {
  const { data, error } = await adminClient().rpc("shopify_start_sync_job", {
    p_business_id: businessId,
    p_job_id: jobId,
  });
  if (error) throw new Error(`startSyncJob failed: ${error.message}`);
  return data === true;
}

export async function updateSyncProgress(
  businessId: string,
  jobId: string,
  progress: { processed: number; failed?: number; cursor?: string | null; total?: number | null }
): Promise<void> {
  const { error } = await adminClient().rpc("shopify_update_sync_progress", {
    p_business_id: businessId,
    p_job_id: jobId,
    p_processed: progress.processed,
    p_failed: progress.failed ?? 0,
    p_cursor: progress.cursor ?? null,
    p_total: progress.total ?? null,
  });
  if (error) throw new Error(`updateSyncProgress failed: ${error.message}`);
}

export async function completeSyncJob(
  businessId: string,
  jobId: string,
  lastSyncedAt?: string | null
): Promise<void> {
  const { error } = await adminClient().rpc("shopify_complete_sync_job", {
    p_business_id: businessId,
    p_job_id: jobId,
    p_last_synced_at: lastSyncedAt ?? null,
  });
  if (error) throw new Error(`completeSyncJob failed: ${error.message}`);
}

export async function failSyncJob(
  businessId: string,
  jobId: string,
  errorMessage: string
): Promise<void> {
  const { error } = await adminClient().rpc("shopify_fail_sync_job", {
    p_business_id: businessId,
    p_job_id: jobId,
    p_error: errorMessage.slice(0, 500),
  });
  if (error) throw new Error(`failSyncJob failed: ${error.message}`);
}

/**
 * Re-queue a still-running job for continuation on the next scheduler tick,
 * preserving its persisted cursor + counters (attempts are NOT bumped — this is
 * a cooperative yield, not a failure). Guarded on status='running' so a
 * concurrent completion can't be clobbered.
 */
export async function requeueSyncJobForContinuation(
  businessId: string,
  jobId: string
): Promise<void> {
  const { error } = await adminClient()
    .from("shopify_sync_jobs")
    .update({ status: "queued", next_run_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", jobId)
    .eq("status", "running");
  if (error) throw new Error(`requeueSyncJobForContinuation failed: ${error.message}`);
}

/** Atomically claim the next due job across all tenants (scheduler worker). */
export async function claimNextSyncJob(): Promise<ShopifySyncJob | null> {
  const { data, error } = await adminClient().rpc("shopify_claim_next_sync_job");
  if (error) throw new Error(`claimNextSyncJob failed: ${error.message}`);
  return (data as ShopifySyncJob | null) ?? null;
}

/**
 * Scheduler enqueue step: for every connected store, enqueue one incremental
 * 'scheduled' job per resource whose watermark is older than `intervalMinutes`
 * (skipping resources that already have an active job). Returns how many jobs
 * were freshly enqueued. The "who is due" decision lives in SQL (one set-based
 * pass); the cron route just triggers this then drains the queue.
 */
export async function enqueueDueSyncs(intervalMinutes = 60): Promise<number> {
  const { data, error } = await adminClient().rpc("shopify_enqueue_due_syncs", {
    p_interval_minutes: intervalMinutes,
  });
  if (error) throw new Error(`enqueueDueSyncs failed: ${error.message}`);
  return Number(data) || 0;
}

/** Read the per-resource watermark for incremental sync (updated_at_min). */
export async function getSyncStateWatermark(
  businessId: string,
  resource: SyncResource
): Promise<string | null> {
  const { data, error } = await adminClient()
    .from("shopify_sync_state")
    .select("last_synced_at")
    .eq("business_id", businessId)
    .eq("resource", resource)
    .maybeSingle<{ last_synced_at: string | null }>();
  if (error) throw new Error(`getSyncStateWatermark failed: ${error.message}`);
  return data?.last_synced_at ?? null;
}

// ---------- Upsert helpers (delegate to SECURITY DEFINER RPCs) ----------

async function callUpsert(fn: string, businessId: string, payloadKey: string, payload: unknown) {
  const { error } = await adminClient().rpc(fn, {
    p_business_id: businessId,
    [payloadKey]: payload,
  });
  if (error) throw new Error(`${fn} failed: ${error.message}`);
}

export const upsertProduct = (b: string, p: unknown) =>
  callUpsert("shopify_upsert_product", b, "p_product", p);
export const upsertCollection = (b: string, p: unknown) =>
  callUpsert("shopify_upsert_collection", b, "p_collection", p);
export const upsertDiscount = (b: string, p: unknown) =>
  callUpsert("shopify_upsert_discount", b, "p_discount", p);
export const upsertInventory = (b: string, p: unknown) =>
  callUpsert("shopify_upsert_inventory", b, "p_inventory", p);
export const upsertCustomer = (b: string, p: unknown) =>
  callUpsert("shopify_upsert_customer", b, "p_customer", p);

/** Order ingestion reuses the existing 0038 RPC (unchanged). */
export async function ingestOrder(businessId: string, order: unknown): Promise<void> {
  const { error } = await adminClient().rpc("shopify_ingest_order", {
    p_business_id: businessId,
    p_order: order,
  });
  if (error) throw new Error(`shopify_ingest_order failed: ${error.message}`);
}
