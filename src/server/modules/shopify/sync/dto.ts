import "server-only";

/**
 * Shopify sync DTOs — the wire shapes for the merchant sync-control surface.
 *
 * These map the SECURITY DEFINER read-model RPCs (shopify_connection_health,
 * shopify_sync_status, shopify_recent_sync_jobs) into stable camelCase JSON.
 * The encrypted token and any internal-only columns never appear here — the RPCs
 * already project display-safe fields, and these mappers copy only those.
 */

// ---------- Connection health (shopify_connection_health) ----------

export interface WebhookThroughputDTO {
  processed: number;
  failed: number;
  total: number;
}

export interface ActiveJobDTO {
  resource: string;
  status: string;
  processed: number;
  total: number | null;
}

export interface ConnectionHealthDTO {
  connected: boolean;
  shopDomain: string | null;
  status: string | null;
  installedAt: string | null;
  webhooks24h: WebhookThroughputDTO;
  activeJob: ActiveJobDTO | null;
  lastError: string | null;
}

/** Raw jsonb shape returned by shopify_connection_health. */
export interface ConnectionHealthRow {
  connected: boolean;
  shop_domain: string | null;
  status: string | null;
  installed_at: string | null;
  webhooks_24h: { processed: number; failed: number; total: number } | null;
  active_job: {
    resource: string;
    status: string;
    processed: number;
    total: number | null;
  } | null;
  last_error: string | null;
}

export function toConnectionHealthDTO(row: ConnectionHealthRow): ConnectionHealthDTO {
  const w = row.webhooks_24h ?? { processed: 0, failed: 0, total: 0 };
  return {
    connected: !!row.connected,
    shopDomain: row.shop_domain ?? null,
    status: row.status ?? null,
    installedAt: row.installed_at ?? null,
    webhooks24h: {
      processed: Number(w.processed) || 0,
      failed: Number(w.failed) || 0,
      total: Number(w.total) || 0,
    },
    activeJob: row.active_job
      ? {
          resource: row.active_job.resource,
          status: row.active_job.status,
          processed: Number(row.active_job.processed) || 0,
          total: row.active_job.total == null ? null : Number(row.active_job.total),
        }
      : null,
    lastError: row.last_error ?? null,
  };
}

// ---------- Per-resource sync state (shopify_sync_status) ----------

export interface ResourceSyncStateDTO {
  resource: string;
  lastSyncedAt: string | null;
  lastStatus: string | null;
  nextSyncAt: string | null;
  totalSynced: number;
  updatedAt: string | null;
}

export interface ResourceSyncStateRow {
  resource: string;
  last_synced_at: string | null;
  last_status: string | null;
  next_sync_at: string | null;
  total_synced: number | string | null;
  updated_at: string | null;
}

export function toResourceSyncStateDTO(row: ResourceSyncStateRow): ResourceSyncStateDTO {
  return {
    resource: row.resource,
    lastSyncedAt: row.last_synced_at ?? null,
    lastStatus: row.last_status ?? null,
    nextSyncAt: row.next_sync_at ?? null,
    totalSynced: Number(row.total_synced) || 0,
    updatedAt: row.updated_at ?? null,
  };
}

// ---------- Sync jobs / logs (shopify_recent_sync_jobs) ----------

export interface SyncJobDTO {
  id: string;
  resource: string;
  mode: string;
  status: string;
  processed: number;
  total: number | null;
  failed: number;
  attempts: number;
  error: string | null;
  triggeredBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface SyncJobRow {
  id: string;
  resource: string;
  mode: string;
  status: string;
  processed: number | string | null;
  total: number | string | null;
  failed: number | string | null;
  attempts: number | string | null;
  error: string | null;
  triggered_by: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | string | null;
  created_at: string;
}

export function toSyncJobDTO(row: SyncJobRow): SyncJobDTO {
  return {
    id: row.id,
    resource: row.resource,
    mode: row.mode,
    status: row.status,
    processed: Number(row.processed) || 0,
    total: row.total == null ? null : Number(row.total),
    failed: Number(row.failed) || 0,
    attempts: Number(row.attempts) || 0,
    error: row.error ?? null,
    triggeredBy: row.triggered_by,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    createdAt: row.created_at,
  };
}

// ---------- Composite dashboard payload ----------

export interface SyncOverviewDTO {
  health: ConnectionHealthDTO;
  resources: ResourceSyncStateDTO[];
  recentJobs: SyncJobDTO[];
}

/** Result of a trigger request: which resources were enqueued + their job ids. */
export interface TriggerResultDTO {
  enqueued: Array<{ resource: string; jobId: string | null }>;
  mode: string;
}
