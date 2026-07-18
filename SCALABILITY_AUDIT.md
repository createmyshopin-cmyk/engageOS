# EngageOS — Scalability Audit

**Date:** 2026-07-17
**Scope:** Read-only audit. No code was modified.
**Stack observed:** Next.js 16 (App Router, `runtime = "nodejs"`), React 19, Supabase (Postgres 17) via `@supabase/supabase-js` service-role client, Zod validation. Deployed serverless (Vercel-style — `after()`, `maxDuration` used).

---

## Executive Summary

EngageOS is architected as a **stateless Next.js app in front of a Postgres (Supabase) database that carries almost all of the concurrency-critical logic**. The play/redeem hot paths are genuinely atomic and race-safe because the invariants live in `SECURITY DEFINER` PL/pgSQL functions, not in application code. Indexing is thorough. Idempotency and forward-only state guards on webhooks are well done.

However, **there is no dedicated queue/worker infrastructure**. All asynchronous work (WhatsApp coupon delivery, CRM sync, webhook processing) runs in-process via Next.js `after()`. There is **no Redis, no BullMQ, no durable job queue, no retry/backoff, and no dead-letter handling**. Rate limiting is split between a robust DB-backed limiter (hot path) and an in-memory per-process limiter (integration APIs) that does not survive horizontal scaling. Shopify integration does not exist in the codebase at all.

**Overall scalability score: 58 / 100** — solid data-layer foundations, but the async/queue/worker tier that the requirements assume is largely absent.

---

## Item-by-Item Findings

### 1. Redis — ❌ Missing
- No `redis`, `ioredis`, or `@upstash/redis` in `package.json`.
- `src/lib/wacrm/rate-limit.ts` explicitly documents Redis as the *intended* swap for multi-instance deploys, but it is not wired up.
- **Impact:** No shared cache, no cross-instance coordination, no distributed locks.

### 2. BullMQ — ❌ Missing
- No `bullmq` / `bull` dependency. No queue definitions anywhere.
- Async work is handled by `next/server`'s `after()` (fire-after-response), which is **best-effort and ephemeral** — if the serverless invocation is reclaimed, the job is lost with no retry.

### 3. Queue Workers — ❌ Missing
- No worker process, no `worker.ts`, no separate long-running consumer.
- The only "drain" mechanism is `dispatchPendingCoupons()` ([src/lib/wacrm/sync.ts](src/lib/wacrm/sync.ts#L295)), which is **merchant-triggered via an HTTP POST** ([src/app/api/m/whatsapp/dispatch/route.ts](src/app/api/m/whatsapp/dispatch/route.ts)) and bounded to 50 rows per click — a manual outbox drain, not an autonomous worker.

### 4. Background Jobs — ⚠️ Partially Implemented
- **Present:** `after()` is used consistently and correctly to keep the customer-facing response fast — play sync ([src/app/api/play/route.ts:52](src/app/api/play/route.ts#L52)), redeem sync, and both webhook handlers all defer heavy work post-response.
- **Missing:** No scheduled/cron jobs. Migrations *reference* a "Feature 6 cron" and an outbox `notifications` table ([supabase/migrations/0003_notifications.sql](supabase/migrations/0003_notifications.sql)), but **no cron runner, `vercel.json` crons, or scheduler exists**. Session cleanup is done lazily on login instead of on a schedule. `after()` is not a durable background-job system — no persistence, no retry, no visibility.

### 5. PostgreSQL Connection Pooling — ⚠️ Partially Implemented
- Supabase provides a **Supavisor/PgBouncer pooler** at the platform level, and `supabase/config.toml` shows pooler settings (`pool_mode = "transaction"`, `default_pool_size = 20`, `max_client_conn = 100`) — but that block is the **local dev config with `enabled = false`**.
- The app creates a **fresh `createClient()` on every RPC call** (`adminClient()` in [src/lib/db/rpc.ts:9](src/lib/db/rpc.ts#L9)). This is the Supabase JS client (HTTP/PostgREST), so it does not hold raw PG sockets — pooling is delegated to Supabase's edge. **Acceptable, but there is no app-side pooling and no guarantee the production connection string points at the transaction pooler (port 6543) vs. a direct connection.**
- **Risk:** Under high concurrency, if the production `SUPABASE_URL` / DB connection is not routed through the pooler, connection exhaustion is possible.

### 6. Database Indexes — ✅ Already Implemented
- Comprehensive and intentional. Examples:
  - `plays_business_idx (business_id, created_at desc)`, `coupons_business_status_idx (business_id, status)`, partial index `coupons_wa_pending_idx WHERE wa_status = 'pending'` ([0001_mvp.sql](supabase/migrations/0001_mvp.sql)).
  - `campaign_events` has both single-column and composite hot-path indexes ([0016_campaign_events.sql](supabase/migrations/0016_campaign_events.sql)).
  - Partial unique index enforcing one fallback prize per campaign; weighted-draw index on prizes ([0010_prize_types.sql](supabase/migrations/0010_prize_types.sql)).
  - Session/token lookup indexes on `merchant_sessions`.
- Unique indexes double as concurrency backstops (one play per campaign/customer).

### 7. Atomic RPC Functions — ✅ Already Implemented
- This is the **strongest part of the system.** All state-mutating invariants run inside single-transaction `SECURITY DEFINER` PL/pgSQL functions:
  - `play_campaign(...)` ([0020_source_tracking.sql](supabase/migrations/0020_source_tracking.sql#L90)) — rate limits, campaign-live check, customer upsert (`ON CONFLICT`), play-cap, prize allocation, coupon issuance, and funnel events **all in one atomic function**.
  - `allocate_prize`, `redeem_coupon`, `record_scan`, `record_campaign_event`, `increment_wa_sent`, `check_rate_limit`.
- Concurrency handled at the DB via `ON CONFLICT` upserts and unique-index backstops rather than app-level read-modify-write.

### 8. Rate Limiting — ⚠️ Partially Implemented
- **Hot path (strong):** `check_rate_limit()` is a **DB-backed** atomic upsert-counter ([0001_mvp.sql:152](supabase/migrations/0001_mvp.sql#L152)), applied inside `play_campaign` (30/IP, 5/phone) and `record_scan`. This survives horizontal scaling because state lives in Postgres.
- **Integration APIs (weak):** `src/lib/wacrm/rate-limit.ts` is an **in-memory `Map` per Node process** — fixed-window counters for send/broadcast/API/AI budgets. The file's own header warns it is **defeated by multi-instance / serverless fan-out**. On Vercel-style deploys with many concurrent lambdas, these limits are effectively per-invocation and provide little real protection.

### 9. Concurrent Request Safety — ✅ Already Implemented
- Play flow: atomic RPC + `ON CONFLICT` + unique index (double-submit of same phone collapses safely).
- WATI webhook: `claimWatiWebhookDelivery()` idempotency claim before side effects; coupon receipts use a **compare-and-swap update** (`.eq("wa_status", coupon.wa_status)`) so two concurrent receipts can't both win ([src/lib/wati/webhook.ts:180](src/lib/wati/webhook.ts#L180)); forward-only status ladder prevents regression.
- Broadcast recipient counts owned by DB aggregate triggers (not app writes) to avoid races.

### 10. Retry Mechanisms — ❌ Missing
- API clients (`WatiClient.request`, wacrm client, Meta API) do a **single `fetch()` with no retry, no exponential backoff, no jitter** ([src/lib/wati/client.ts:56](src/lib/wati/client.ts#L56)). A transient 5xx/network blip = permanent failure for that message.
- The only "retry" is a **manual, merchant-initiated** requeue (failed → pending) drained by clicking Dispatch. No automatic retry, no max-attempts/backoff policy, no dead-letter queue.
- Broadcast delivery has **phone-variant fallback** (tries E.164 variants) — useful, but that is input correction, not failure retry.

### 11. Webhook Queueing — ⚠️ Partially Implemented
- Inbound webhooks (WATI, WhatsApp/Meta) **ACK 200 immediately, then process in `after()`** ([src/app/api/webhooks/wati/route.ts:74](src/app/api/webhooks/wati/route.ts#L74)) — good latency design that avoids provider retry storms.
- Idempotency claim collapses provider retries (WATI's up-to-144 re-deliveries) onto one processing.
- **But it is not a real queue:** no durable buffer, no worker, no retry if the `after()` processing itself throws mid-flight (it swallows and returns "processed"). A crash between ACK and completion loses that event silently, and the provider won't re-send because we already 200'd.

### 12. WhatsApp Queue — ⚠️ Partially Implemented
- There **is a durable outbox pattern in the data model**: `coupons.wa_status` (pending/sent/delivered/read/failed) and `notifications.wa_status` act as a persisted queue-of-record, with a partial index on pending rows.
- **But there is no queue processor.** Delivery happens synchronously inside `after()` on the play request ([src/lib/wati/sync.ts:138](src/lib/wati/sync.ts#L138), [src/lib/wacrm/sync.ts:117](src/lib/wacrm/sync.ts#L117)), or via the manual `dispatchPendingCoupons` drain (50/call, sequential `for` loop, awaited one message at a time). No concurrency control on sends beyond the DB quota counter, no rate-matching to WhatsApp's own throughput limits, no automatic draining.

### 13. Shopify Queue — ❌ Missing
- **No Shopify integration exists in the codebase at all** — no Shopify SDK, no routes, no sync module, no tables. (Shopify skills are available in the environment, but nothing is implemented.) There is therefore no Shopify queue, webhook handler, or worker.

### 14. Worker Architecture — ❌ Missing
- No dedicated worker tier, no process separation between web and workers, no message broker.
- The system is **web-request-driven end to end**: all async work is a tail of an HTTP request via `after()`, or a manual admin-triggered drain. This is the single biggest scalability gap relative to the requirements.

---

## Summary Table

| # | Capability | Status |
|---|------------|--------|
| 1 | Redis | ❌ Missing |
| 2 | BullMQ | ❌ Missing |
| 3 | Queue Workers | ❌ Missing |
| 4 | Background Jobs | ⚠️ Partial (`after()` only, no cron/durable jobs) |
| 5 | PostgreSQL Connection Pooling | ⚠️ Partial (Supabase pooler exists; not app-verified/enforced) |
| 6 | Database Indexes | ✅ Implemented |
| 7 | Atomic RPC Functions | ✅ Implemented |
| 8 | Rate Limiting | ⚠️ Partial (DB-backed on hot path; in-memory elsewhere) |
| 9 | Concurrent Request Safety | ✅ Implemented |
| 10 | Retry Mechanisms | ❌ Missing (single fetch, manual requeue only) |
| 11 | Webhook Queueing | ⚠️ Partial (`after()` + idempotency, no durable queue) |
| 12 | WhatsApp Queue | ⚠️ Partial (outbox table exists; no processor) |
| 13 | Shopify Queue | ❌ Missing (no Shopify at all) |
| 14 | Worker Architecture | ❌ Missing |

**Tally:** ✅ 3 · ⚠️ 5 · ❌ 6

---

## Capacity Estimates

These are **engineering estimates**, not load-test results, assuming a standard Supabase tier (transaction pooler, ~200 effective connections) and serverless Next.js with auto-scaling lambdas. The binding constraint in nearly every case is **Postgres write throughput + connection limits**, and — for messaging — **third-party WhatsApp provider limits**, not the app tier.

### Safe Concurrent Users (browsing / general)
**~2,000–5,000 concurrent users.**
Reads are indexed and light; pages are largely static/server-rendered. Bounded by Supabase connection pool and PostgREST throughput. The stateless app tier scales horizontally without issue.

### Safe Concurrent QR Scans
**~300–600 scans/second sustained (short bursts higher).**
`record_scan` is a single atomic RPC with an internal rate-limit dedupe, so it's cheap and race-safe. The ceiling is Postgres write/connection throughput, not app logic. With the transaction pooler this is comfortable; without verified pooling it drops sharply.

### Safe Simultaneous Scratch (`play_campaign`) Requests
**~150–300 plays/second sustained.**
`play_campaign` is heavier — it does an upsert, several `record_customer_event`/`record_campaign_event` inserts, prize allocation, and coupon issuance **in one transaction**. Fully atomic and correct under contention (unique-index backstop), but the multi-insert transaction is the throughput limiter. Per-campaign hot rows (`play_limit` count, prize inventory) will serialize somewhat under extreme contention on a single popular campaign.

### Safe WhatsApp Throughput
**~10–50 messages/second, and fragile.**
Sends are **synchronous, sequential, in-process** (awaited one at a time in `after()` or the 50-row manual drain). There is **no queue, no batching, no automatic retry, no backpressure** against WhatsApp's own tier limits (typically 80 msg/s on Meta Cloud API, provider-throttled on WATI). At high volume this will: (a) exhaust serverless execution time, (b) drop messages on transient failures (no retry), and (c) potentially trip provider rate limits. **This is the least scalable path and the top priority for a real queue + worker.**

---

## Top Recommendations (in priority order)

1. **Introduce a durable queue + worker tier** (BullMQ+Redis, or Supabase `pgmq`/`pg_cron`, or Upstash QStash) for WhatsApp/CRM delivery. Replace the synchronous `after()` sends with enqueue-and-return; drain from a worker with concurrency control matched to provider limits.
2. **Add automatic retry with exponential backoff + jitter + max-attempts + dead-letter** to all outbound API clients (WATI, wacrm, Meta).
3. **Convert the manual coupon drain into an autonomous scheduled worker** (cron) reading the existing `coupons.wa_status='pending'` / `notifications` outbox — the data model already supports this.
4. **Make rate limiting distributed** — move `src/lib/wacrm/rate-limit.ts` onto Redis/Upstash (call sites already abstracted for this swap) so limits hold across serverless instances.
5. **Verify production DB routing goes through the Supabase transaction pooler** and set explicit connection limits; add app-side timeouts.
6. **Add request timeouts** to all `fetch()` calls (currently unbounded) to prevent a slow provider from consuming serverless execution budget.
