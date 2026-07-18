# SHOPIFY SYNC ENGINE — IMPLEMENTATION

> **Status:** ✅ Production (2026-07-18) · The first operational engine after the
> Merchant Dashboard integration (Phases 1–9). Strictly additive and backward
> compatible — no existing module was rewritten.
>
> **Quality gates:** `tsc --noEmit` 0 · `next build` 0 · `vitest` 56 passing ·
> tenant isolation preserved · backward compatible.

---

## 1. Overview

The Sync Engine connects a merchant's Shopify store to EngageOS and keeps the
CDP mirror current through two complementary paths:

- **Push (webhooks)** — real-time deltas Shopify sends on order/customer/product/
  collection/inventory/discount changes. Owned by the pre-existing ingestion
  module (`src/server/modules/shopify/*` + `0038_shopify_commerce.sql`).
- **Pull (sync jobs)** — initial backfill and periodic reconciliation the engine
  performs against the Shopify Admin API. Owned by this work
  (`src/lib/shopify/sync-engine.ts` + `0040_shopify_sync_engine.sql`).

Both write through the same SECURITY DEFINER upsert RPCs, so a webhook and a
sync job that touch the same record converge idempotently.

### Design principles (non-negotiable)

| Principle | How it's enforced |
|---|---|
| Controller → Service → Repository → RPC | No SQL in controllers; repositories only call RPCs via `TenantRepository`/`adminClient`. |
| Tokens never leave the server | `access_token_enc` is AES-256-GCM ciphertext; no DTO or RPC read-model projects it. |
| Tenant identity from the session | `businessId` derives from the authenticated principal; never from client input or webhook payload. |
| No long-running HTTP | Triggers enqueue and return; execution runs in `after()` / cron. Every job is resumable. |
| Idempotent everything | Webhook replays and duplicate jobs are dropped at the DB (`shopify_log_webhook`, partial unique index on active jobs). |

---

## 2. Architecture

```
Browser (merchant dashboard)
  │  React Query hooks (use-shopify.ts) — never fetch/DB directly, never send tenant id
  ▼
/api/v1/shopify/sync            (route.ts — thin: runtime=nodejs, force-dynamic)
  ▼
ShopifySyncController           requireScope(read|write); after() schedules background run
  ▼
ShopifySyncService              assembles bundle; trigger() selects+enqueues (does NOT run)
  ▼
ShopifySyncRepository           rpcScalar over read-model RPCs + shopify_create_sync_job
  ▼
Postgres RPCs (SECURITY DEFINER, search_path=public)

Background (no HTTP held open):
  after()  ──► claimAndRunJob(businessId, jobId) ─┐
  cron     ──► enqueueDueSyncs → drainDueJobs ────┤► runSyncJob ─► Shopify Admin API ─► upsert RPCs
                                                   └► atomic queued→running claim (no double-run)
```

### Layer inventory

**Integration layer** — `src/lib/shopify/` (service-role, business-scoped, kept
OUT of `TenantRepository` because it manages secrets and cross-tenant scheduling):

| File | Responsibility |
|---|---|
| `oauth.ts` | Authorize-URL builder, `state` nonce, `*.myshopify.com` domain guard, env config. |
| `store.ts` | Token + job + sync-state persistence (`adminClient`); AES-256-GCM encrypt/decrypt of tokens; `enqueueDueSyncs`. |
| `adapter.ts` | Tenant-aware facade: `connectShopify`, `disconnectShopify`, `markUninstalled`, `WEBHOOK_TOPICS`, webhook registration. |
| `client.ts` | Shopify Admin API client (REST, cursor pagination). |
| `sync-engine.ts` | `runSyncJob`, `claimAndRunJob`, `drainDueJobs` — the pull worker. |
| `normalizers.ts` | Shopify payload → RPC argument shaping. |
| `types.ts` | `SyncResource`, `SYNC_RESOURCES`, `SyncMode`, `SyncJobStatus`. |

**v1 sync module** — `src/server/modules/shopify/sync/`:

| File | Responsibility |
|---|---|
| `validator.ts` | Zod: `triggerSyncBody` (`resources?`, `mode?`), `listSyncJobsQuery` (`limit?`). `business_id` never accepted. |
| `dto.ts` | snake→camel mappers over the read-model RPCs; numeric coercion; **display-safe fields only**. |
| `repository.ts` | `connectionHealth`/`syncStatus`/`recentJobs`/`createJob` via `rpcScalar`. |
| `service.ts` | `health`/`overview`/`jobs`/`trigger`. `trigger` de-dupes + canonicalizes targets, enqueues idempotently, returns job ids. |
| `controller.ts` | `health`/`overview`/`jobs` (`read`); `trigger` (`write`) → `after()` runs each enqueued job. |

**v1 connection module** — `src/server/modules/shopify/connection/`: `disconnect()`
gated **owner/manager** (`requireRole`) → `disconnectShopify` drops the token row.

**Client** — `src/lib/api/hooks/use-shopify.ts`, `src/lib/api/types.ts`,
`src/components/merchant/shopify/{shopify-view,shopify-sync-panel}.tsx`.

---

## 3. Data model

Tables span two migrations (both additive):

**`0038_shopify_commerce.sql`** (pre-existing):
- `shopify_shops` — one row per connected store. `access_token_enc` (AES-256-GCM),
  `webhook_secret_enc` (per-shop HMAC secret; null → app secret), `status`,
  `installed_at`, `business_id`.
- `shopify_products`, `shopify_webhook_log` (idempotency ledger).

**`0040_shopify_sync_engine.sql`** (this work):
- `shopify_oauth_states` — CSRF nonce ↔ (business_id, shop), short-lived.
- `shopify_sync_jobs` — the job queue/history. `status ∈ {queued,running,completed,
  failed,cancelled}`, `resource`, `mode`, `processed`, `total`, `failed`,
  `attempts`, `error`, `triggered_by`, `started_at`, `finished_at`, `duration_ms`.
  **Partial unique index** on `(business_id, resource) where status in
  ('queued','running')` — the idempotency guarantee for enqueue.
- `shopify_sync_state` — per-(business, resource) cursor: `last_synced_at`,
  `last_status`, `next_sync_at`, `total_synced`.
- `shopify_collections`, `shopify_discounts`, `shopify_inventory` — mirror tables.

### RPCs (all SECURITY DEFINER, `search_path = public`, execute revoked from public/anon/authenticated)

| RPC | Kind | Purpose |
|---|---|---|
| `shopify_upsert_{product,collection,discount,inventory,customer}` | write | Idempotent mirror upserts (shared by webhook + sync). |
| `shopify_create_sync_job` | write | Enqueue a job; returns existing id if one is already active (idempotent). |
| `shopify_start_sync_job` | write | Atomic `queued → running` claim (returns false if already claimed). |
| `shopify_update_sync_progress` | write | Bump `processed`/`total` mid-run (resumable progress). |
| `shopify_complete_sync_job` / `shopify_fail_sync_job` | write | Terminal transitions + `shopify_sync_state` update. |
| `shopify_claim_next_sync_job` | write | Cron drain: claim the oldest due job. |
| `shopify_enqueue_due_syncs` | write | Scheduler: enqueue scheduled jobs for stores past their interval. |
| `shopify_connection_health` | read | Dashboard header: connected, shop, 24h webhook throughput, active job, last error. |
| `shopify_sync_status` | read | Per-resource sync state array. |
| `shopify_recent_sync_jobs` | read | Recent job log (newest first). |

The three read RPCs each return a **single aggregated `jsonb`** (object or array),
so the repository reads them with `rpcScalar` — `rpcSelect` would re-wrap the
already-aggregated array.

---

## 4. API endpoints

| Method · Path | Auth | Body / Query | Returns |
|---|---|---|---|
| `GET /api/v1/shopify/sync` | `read` | — | `ShopifySyncOverviewDTO {health, resources[], recentJobs[]}` |
| `POST /api/v1/shopify/sync` | `write` | `{resources?: string[], mode?: "manual"\|"incremental"}` | `ShopifyTriggerResultDTO {enqueued[], mode}` |
| `GET /api/v1/shopify/sync/health` | `read` | — | `ShopifyConnectionHealthDTO` |
| `GET /api/v1/shopify/sync/jobs` | `read` | `?limit=1..100` | `ShopifySyncJobDTO[]` |
| `POST /api/v1/shopify/disconnect` | owner/manager | — | `{disconnected: true}` |
| `GET /api/shopify/install` | session | `?shop=<store>.myshopify.com` | 302 → Shopify authorize |
| `GET /api/shopify/callback` | session (state) | Shopify OAuth params | 302 → `/m/shopify?connected=1` |
| `GET /api/shopify/cron` | `x-cron-secret` | `?interval=5..1440&max=1..100` | `{ok, enqueued, processed}` |
| `POST /api/webhooks/shopify` | HMAC | raw body | `200` (always, after idempotent claim) |

All v1 route handlers set `runtime="nodejs"`, `dynamic="force-dynamic"`, and a
bounded `maxDuration`. The OAuth install is a **top-level browser navigation**,
never a fetch — tokens must not pass through the client.

---

## 5. Webhook topics

Registered on install (`adapter.ts` → `WEBHOOK_TOPICS`), verified on receipt:

```
orders/create        orders/updated       orders/paid
customers/create     customers/update
products/create      products/update      products/delete
collections/create   collections/update
inventory_levels/update
discounts/create     discounts/update
app/uninstalled
```

Each delivery is HMAC-verified against `SHOPIFY_WEBHOOK_SECRET` (or the per-shop
`webhook_secret_enc`), then claimed via `shopify_log_webhook` (returns false on
replay → dropped without re-ingesting). `business_id` comes from the verified
tenant row, **never** the payload.

---

## 6. Sync lifecycle

**Job types:** initial (backfill), incremental (delta since `last_synced_at`),
manual (merchant-triggered), scheduled (cron), plus selective/partial (a named
subset of resources) and retry/resume (a failed or interrupted job re-run).

```
enqueue ─► queued ─► [claim: queued→running] ─► running ─┬─► completed ─► sync_state.last_synced_at
   │                                                      └─► failed ─► (retry: re-enqueue)
   └─ idempotent: an already-active (business,resource) returns the existing id
```

**Progress tracking:** each job records `processed`/`total`/`failed`/`attempts`/
`duration_ms`. `runSyncJob` calls `shopify_update_sync_progress` as it pages the
Admin API, so the dashboard's 4s poll shows live counts, and an interrupted job
resumes from its cursor rather than restarting.

**Trigger target selection** (`ShopifySyncService.trigger`): a named subset is
de-duped and returned in canonical `SYNC_RESOURCES` order; unknown names are
dropped; empty/absent → all six resources. (Unit-tested in
`test/shopify-sync-dto.test.ts`.)

---

## 7. Background processing

Two independent drivers, both using the **atomic `queued→running` claim** so a
job is never processed twice:

1. **On-demand** — `POST /sync` enqueues, returns immediately, then the
   controller's `after()` loops `claimAndRunJob(businessId, jobId)` over the
   enqueued ids. The HTTP response is already sent; no request is held open.
2. **Scheduled** — `GET /api/shopify/cron` calls `enqueueDueSyncs(interval)`
   (SQL decides which stores are past their interval) then `drainDueJobs(max)`.
   The "which stores are due" decision lives in `shopify_enqueue_due_syncs`,
   keeping the route thin (enqueue → drain).

Because both paths claim atomically, a job the cron drains and a job the trigger
runs can never collide.

---

## 8. Retry & error strategy

- **Enqueue idempotency** — the partial unique index means re-triggering a
  resource that's already `queued`/`running` returns the existing job id instead
  of stacking duplicates.
- **Failure** — `shopify_fail_sync_job` records the error + increments
  `attempts`; the job is left in a re-enqueueable state. A subsequent trigger (or
  the scheduler) picks it up fresh.
- **Resume** — progress is checkpointed via `shopify_update_sync_progress`, so an
  interrupted `running` job continues from its cursor.
- **Webhook failures** — surfaced in `shopify_connection_health.webhooks_24h.failed`
  and the dashboard's 24h throughput line.

---

## 9. Security

- **Token encryption** — `access_token_enc` and `webhook_secret_enc` are
  AES-256-GCM ciphertext (`WACRM_ENCRYPTION_KEY`), decrypted only server-side at
  call time. No DTO, read RPC, or overview projects them.
- **Webhook validation** — every inbound webhook is HMAC-verified before any
  processing; unverified deliveries are rejected.
- **Tenant isolation** — `businessId` is session-derived (v1 guard) or, for
  webhooks, taken from the HMAC-verified tenant row. Client input and webhook
  payloads are never trusted for identity. RPCs are business-scoped.
- **Idempotency** — duplicate webhooks (`shopify_log_webhook`) and duplicate jobs
  (partial unique index) are dropped at the DB, preventing double-processing.
- **Cron** — guarded by a shared `x-cron-secret` compared with `timingSafeEqual`
  (constant-time); 503 when the secret is unconfigured, 401 on mismatch.
- **Destructive gating** — disconnect (tenant-wide token revocation) requires
  owner/manager.

---

## 10. Dashboard UI

`/m/shopify` → `ShopifyView` (client island under a `Suspense` boundary for
`useSearchParams`):

- **Disconnected** → connect form. Accepts `mystore` or a pasted URL, normalizes
  to `*.myshopify.com`, and navigates to `/api/shopify/install?shop=…`.
- **Connected** → totals strip (orders/products/revenue, from the Phase 4
  overview) **+ `ShopifySyncPanel`**:
  - Connection-health header — active/idle, 24h webhook throughput (with failed
    count), live refresh indicator.
  - **Sync all now** + per-resource **selective sync** buttons.
  - Live active-job progress bar (`useShopifySync` polls every 4s while a job is
    active; stops when idle).
  - Per-resource state cards (last sync "time ago", status pill, total synced).
  - Recent-jobs log (resource · mode · processed/failed · duration · time ago ·
    status; error line when failed).
  - Disconnect (with inline confirm).
- **Banners** — `?connected=1` (success) and `?shopify_error=…` (from the install/
  callback redirects).

Client contract: hooks in `use-shopify.ts` wrap the typed `apiClient`; DTO mirrors
in `api/types.ts`. The client never sends a tenant id and never touches tokens.

---

## 11. Testing

- `test/shopify.test.ts` (5) — HMAC verify (accept/reject/tamper), idempotent
  replay, tenant `business_id` never payload-derived.
- `test/shopify-sync-dto.test.ts` (10) — connection-health / resource-state / job
  mappers (numeric coercion, null preservation, no token leakage) + trigger target
  selection (all / de-dupe+canonicalize / drop-unknown).
- Full suite: **56 passing** across 10 files.

**Gates run:** `npx tsc --noEmit` (0) · `npx next build` (0, all routes in
manifest) · `npx vitest run` (56) · `npx eslint` (0 on touched files).

---

## 12. Deployment notes

1. **Env** — set `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_WEBHOOK_SECRET`,
   `SHOPIFY_CRON_SECRET`, and confirm `NEXT_PUBLIC_APP_URL` (used to build the
   OAuth redirect + webhook address). `SHOPIFY_SCOPES` is optional. See
   `.env.example`.
2. **Migration** — apply `0040_shopify_sync_engine.sql` (`supabase db push`).
   *(D3: operator applies, implementer verifies.)*
3. **Shopify app** — register `${NEXT_PUBLIC_APP_URL}/api/shopify/callback` as an
   allowed redirect URL; the app's API secret must match `SHOPIFY_WEBHOOK_SECRET`.
4. **Scheduler** — point a cron/uptime pinger at
   `GET /api/shopify/cron` with the `x-cron-secret` header (e.g. every 15–60 min).
   Tune `?interval=` (minutes between scheduled syncs) and `?max=` (jobs drained
   per tick) to your fleet size.
5. **Scale** — jobs are asynchronous, resumable, and claimed atomically, so the
   engine scales horizontally: multiple app instances can drain the same queue
   without double-processing. Reads are keyset/aggregated; no held HTTP requests.
