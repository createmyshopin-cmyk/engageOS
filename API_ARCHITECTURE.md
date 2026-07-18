# EngageOS Enterprise API — Architecture

**Status:** v1 framework + vertical slice (Customers, Events/Timeline, Shopify ingestion) shipped; remaining domain modules scaffolded with fixed contracts.
**Audience:** backend engineers extending the API, and clients (Dashboard, Customer App, Mobile, Admin Panel, AI Services) integrating against it.

> This document is deliverable #1 of the Enterprise API task. It describes the layering, the shared framework, the module map, tenancy/security guarantees, pagination, error contract, versioning, and the Shopify webhook pipeline.

---

## 1. Design goals & constraints

The API is a **domain-driven backend**, not a CRUD wrapper. It must scale to **1000+ merchants, 10M+ customers, 100M+ events** without an architectural rewrite, and it must be consumed identically by five surfaces.

**Hard constraints (never violated):**

1. **Additive only.** Authentication, the Merchant system, and the Campaign / Scratch / Coupon / Reward engines, WATI integration, existing APIs, existing DB schema, and existing RLS are **extended, never modified or broken.** The v1 API is a new layer *on top of* the existing RPCs and tables.
2. **No business logic in route handlers.** A `route.ts` file only wires a validator + controller into the framework. Control flows strictly downward:

   ```
   Route → Validator (Zod) → Controller → Service → Repository → RPC → Database
   ```
3. **Tenancy is never trusted from the client.** `business_id` is derived server-side from the authenticated principal. It is never read from a body, query, or header (except the Shopify shop-domain header, which is HMAC-verified and mapped through a trusted table).
4. **No SQL in controllers.** SQL lives in migrations (RPCs) and is reached only through repositories.
5. **Versionable.** `/api/v1` today; `/api/v2` can be added without breaking v1.

---

## 2. Layering

| Layer | Location | Responsibility | May NOT |
| --- | --- | --- | --- |
| **Route** | `src/app/api/v1/**/route.ts` | Wire a Zod schema + controller method via `defineRoute`. | Contain logic, touch `NextResponse`, read the session. |
| **Validator** | `modules/<m>/validator.ts` | Zod schemas for body/query/params. | Hit the DB. |
| **Controller** | `modules/<m>/controller.ts` | Derive tenant from principal, check scope, marshal input → service, return DTO. | Contain business rules, write SQL. |
| **Service** | `modules/<m>/service.ts` | Business logic, orchestration, audit, 404/conflict decisions. | Touch `NextRequest`/`NextResponse`, build envelopes. |
| **Repository** | `modules/<m>/repository.ts` | Data access via `TenantRepository` + RPCs. | Contain business rules. |
| **RPC / DB** | `supabase/migrations/*.sql` | `SECURITY DEFINER` functions, RLS, constraints. | — |

A **DTO** (camelCase, client-facing) is produced by a **transformer** from the snake_case DB row. Clients never see raw rows.

---

## 3. Shared framework (`src/server/`)

Everything is re-exported from the barrel `@/server`; modules import from there, not from individual files.

### `core/`
- **`errors.ts`** — `AppError` base + typed subclasses, each mapping to an HTTP status and a stable string `code`:

  | Error | Status | `code` | Exposed message? |
  | --- | --- | --- | --- |
  | `ValidationError` | 422 | `validation_error` | yes (+ field `details`) |
  | `UnauthorizedError` | 401 | `unauthorized` | yes |
  | `ForbiddenError` | 403 | `forbidden` | yes |
  | `NotFoundError` | 404 | `not_found` | yes |
  | `ConflictError` | 409 | `conflict` | yes |
  | `RateLimitedError` | 429 | `rate_limited` | yes (+ `Retry-After`) |
  | `NotImplementedError` | 501 | `not_implemented` | yes |
  | `ServerError` | 500 | `server_error` | **no** (generic message; cause logged) |

  `toAppError()` normalizes any thrown value; unknown throws become a non-exposed `ServerError`.
- **`Controller.ts` / `Service.ts` / `Repository.ts`** — abstract base classes enforcing the constructor shape of each layer (`principal()`/`businessId` on controllers; `ctx`+`logger` on services; `TenantRepository` on repositories).

### `http/`
- **`responses.ts`** — the **one envelope every endpoint returns**:
  - Success: `{ ok: true, data, meta }`
  - Page: `{ ok: true, data: T[], page: { nextCursor, hasMore, limit }, meta }`
  - Error: `{ ok: false, error: { code, message, details? }, meta }`
  - `meta = { correlationId, timestamp, version }`
- **`pagination.ts`** — keyset/cursor pagination. Opaque base64url cursor encoding `{ ts, id }` (format version-tagged). `DEFAULT_PAGE_LIMIT=25`, `MAX_PAGE_LIMIT=100`. `parseListQuery` (limit/cursor/sort/search/order), `buildPage`.
- **`context.ts`** — `RequestContext { correlationId, version, ip, logger, principal? }`, built per request (honors an inbound `x-correlation-id`). `tenantRepositoryFor(principal)` yields a session-bound `TenantRepository` (synthesizing a session payload for future API-key principals).
- **`handler.ts`** — **`defineRoute(config)`**, the single wrapper: build context → authenticate (unless `auth:false`) → validate body/query/params → invoke handler → envelope the result. Catches every `AppError`, logs with correlation id, returns the error envelope. A handler may return plain data (auto-enveloped) or a prebuilt `NextResponse` (e.g. `paginated`, `noContent`).

### `auth/`
- **`guard.ts`** — a **chain of `AuthResolver`s** tried in order. Today: `[merchantCookieResolver]` (reuses the existing HMAC cookie session). A **Bearer API-key resolver slots into this array later with zero controller changes** — the documented seam for the "cookie now, API-key ready" decision. Produces a `Principal { kind, businessId, actorId, role, scopes, session? }`. `requireScope` / `requireRole` guards. Role→scope: `owner → ["*"]`, `manager → ["read","write"]`, `staff → ["read","redeem"]`.

### `observability/`
- **`logger.ts`** — structured JSON logger, one line per event, correlation-id propagated through `child()`, sensitive keys redacted (`password|secret|token|authorization|api_key|hmac|signature`). Errors serialize with stack; warn/error → stderr, else stdout.

---

## 4. Module map

Implemented modules live under `src/server/modules/<name>/` (full DDD stack) with routes under `src/app/api/v1/<name>/`. Scaffolded modules expose a fixed route contract returning `501 not_implemented` with a documented planned surface in the route file header.

| Module | State | Notes |
| --- | --- | --- |
| **customers** | ✅ implemented | list/get/get360/upsert/consent/tags/merge/timeline. Vertical slice. |
| **events** | ✅ implemented | record + keyset feed (universal event stream). |
| **shopify** | ✅ implemented | HMAC webhook + idempotent order ingestion. |
| **auth** | scaffold | session introspection, logout, deferred API-key lifecycle. |
| **merchants** | scaffold | self-service profile/staff (own business only). |
| **campaigns** | scaffold | facade over existing campaign engine. |
| **orders** | scaffold | read model over ingested orders. |
| **products** | scaffold | read model over ingested products. |
| **loyalty** | scaffold | balance/ledger/adjust; reconciles with rewards. |
| **coupons** | scaffold | facade over `redeem_coupon`. |
| **rewards** | scaffold | facade over reward engine. |
| **segments** | scaffold | DB-side membership; targets marketing/analytics. |
| **marketing** | scaffold | broadcasts via WATI; consent-enforced. |
| **referrals** | scaffold | idempotent referral attribution. |
| **analytics** | scaffold | aggregate RPCs only, never row pulls. |
| **admin** | scaffold | **cross-tenant**, admin principal only. |

---

## 5. Multi-tenancy & security

- **Single source of `business_id`:** the `Principal`, derived from a trusted credential. Controllers call `tenantRepositoryFor(principal)`; the repository auto-scopes every query. No endpoint accepts `business_id` as input — the sole exception is `/api/v1/admin/*`, which requires an admin principal and audits every action.
- **`TenantRepository`** is the only sanctioned data path; it never exposes the raw client and always filters by `business_id`.
- **RLS remains default-deny.** New tables enable RLS and revoke `execute`/`grant`s from `public`/`anon`/`authenticated`; the app reaches them through `SECURITY DEFINER` RPCs with `set search_path = public`.
- **Secrets** (Shopify access & webhook secrets) are **AES-256-GCM encrypted at the app layer** (`src/lib/wacrm/crypto.ts`) before storage.
- **Scopes** gate mutations: e.g. coupon/reward redemption requires the `redeem` scope; writes require `write`; owners hold `*`.

---

## 6. Pagination, filtering, sorting

- **Keyset (cursor) pagination**, not offset — stable under inserts and O(1) at any depth, which is what lets it scale to 100M+ rows.
- Query params: `limit` (1–100, default 25), `cursor` (opaque), `sort`, `order` (`asc`/`desc`), `q` (search).
- The cursor encodes the last row's `(ts, id)` tuple; the repository resumes with a tuple comparison (`WHERE (ts,id) < (:ts,:id)`), never `OFFSET`.
- Response carries `page: { nextCursor, hasMore, limit }`. `nextCursor` is `null` when exhausted.

---

## 7. Shopify ingestion pipeline

Endpoint: **`POST /api/webhooks/shopify`** (`runtime=nodejs`, `maxDuration=60`).

This route intentionally **bypasses the cookie `defineRoute` guard** because it authenticates by HMAC, not session.

**Flow:**
1. Read the **raw body** (`await req.text()`) — parsing would change the bytes and break HMAC.
2. **Resolve tenant** from `X-Shopify-Shop-Domain` → exactly one `shopify_shops` row → `business_id` + secret (per-shop decrypted secret, else `SHOPIFY_WEBHOOK_SECRET`). Unknown shop → `401`.
3. **Verify HMAC-SHA256** (constant-time) of the raw body against the resolved secret. Mismatch → `401`.
4. **Fast ACK 200** immediately; heavy work runs in `after()` so a slow ingest never triggers Shopify's retry storm.
5. Async processing (`ShopifyIngestionService`):
   - **Idempotency claim** via `shopify_log_webhook(business_id, webhook_id, topic, shop_domain, payload)` — `ON CONFLICT DO NOTHING`; a redelivery returns `false` and stops.
   - **Normalize** the order (`normalizeShopifyOrder`) into the compact shape the RPC expects.
   - **Ingest** via `shopify_ingest_order` — upserts on `(business_id, shopify_order_id)`, matches the customer by phone through `merchant_upsert_customer`, emits an `order.placed` universal event with dedup key `shopify:order:<id>`, and recomputes customer analytics.
   - Mark the log row `processed`/`failed`.

**Retry/duplicate safety** is three-layered: webhook-id claim → order upsert → event dedup key. The same order can arrive any number of times and be counted once.

---

## 8. Versioning strategy

- Routes are physically namespaced: `src/app/api/v1/**`. `/api/v2` is a sibling tree that can reuse the same framework and services while presenting a new DTO/validator surface.
- The envelope's `meta.version` records which version served a request.
- Breaking DTO changes go in a new version; additive fields ship in place. Services and repositories are version-agnostic where possible so v2 mostly re-wires controllers/DTOs.

---

## 9. Observability

- Every request gets a **correlation id** (inbound `x-correlation-id` respected, else generated), threaded controller → service → repository via the child logger and returned in `meta.correlationId`.
- Structured JSON logs at `request.ok` / `request.error` include `code`, `status`, `ms`, `businessId`, `actor`. Sensitive keys are redacted.

---

## 10. Migrations added by this task

| File | Purpose |
| --- | --- |
| `supabase/migrations/0038_shopify_commerce.sql` | `shopify_shops`, `shopify_products`, `orders`, `order_items`, `shopify_webhook_log`; wires `events.order_id`; RPCs `shopify_log_webhook`, `shopify_ingest_order`. RLS + revokes. |
| `supabase/migrations/0039_events_read.sql` | `events_feed` keyset read RPC for the tenant event stream. |
| `supabase/smoke/0034_0037_smoke.sql` | Backward-compatibility smoke test (BEGIN/ROLLBACK) asserting the CDP migrations extended — not replaced — existing tables/RPCs/RLS. |

**DB gate:** migrations `0034`–`0039` are applied on a dev branch and smoke-tested **before** the DB-dependent modules are exercised.

---

## 11. Testing

`vitest` covers the framework invariants that every module depends on:
- response envelope shape (success/error/page),
- cursor **round-trip** (`encode`∘`decode` is identity; tampered/foreign cursors reject),
- auth-guard **tenant isolation** (principal `businessId` is the only tenant source),
- Shopify **HMAC verify** (valid/invalid/missing) and **idempotency replay** (second delivery of a webhook id is dropped).

---

## 12. File index

```
src/server/
  index.ts                     barrel (@/server)
  core/        errors.ts  Controller.ts  Service.ts  Repository.ts
  http/        handler.ts  responses.ts  pagination.ts  context.ts
  auth/        guard.ts
  observability/ logger.ts
  modules/
    customers/ dto validator transformer repository service controller
    events/    dto validator repository service controller
    shopify/   webhook-security  normalizer  service

src/app/api/
  v1/customers/**   v1/events/**                     (implemented)
  v1/{auth,merchants,campaigns,orders,products,loyalty,
      coupons,rewards,segments,marketing,referrals,
      analytics,admin}/**                             (scaffold, 501)
  webhooks/shopify/route.ts                           (HMAC webhook)

supabase/
  migrations/0038_shopify_commerce.sql  0039_events_read.sql
  smoke/0034_0037_smoke.sql

openapi/v1.json
```
