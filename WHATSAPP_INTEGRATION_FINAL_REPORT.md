# EngageOS V2.2 — WhatsApp CRM Integration — Final Report

**Integration:** EngageOS ⇄ wacrm (https://github.com/ArnasDon/wacrm)
**Model:** EngageOS = campaign engine · wacrm = WhatsApp CRM / communication engine
**Date:** 2026-07-16

---

## 1. Architecture

```
Customer scratch / staff redeem              Merchant Dashboard (/m/whatsapp)
        │                                              │  (browser — never talks to wacrm)
        ▼                                              ▼
  EngageOS API routes  ──after()──►  ┌──────────────────────────────────┐
  (/api/play, /api/staff/redeem)     │      EngageOS WhatsApp Adapter    │
                                     │  src/lib/wacrm/  +  /api/m/whatsapp/*
                                     └────────────────┬─────────────────┘
                                                      │ HTTPS, Bearer API key (per tenant)
                                                      ▼
                                              wacrm Public API (/api/v1)
                                                      │
                                                      ▼
                                              Meta WhatsApp Cloud API
                                                      │  status callbacks
                                                      ▼
                                     wacrm outbound webhooks ──► /api/webhooks/wacrm
                                                      │  (HMAC-verified, idempotent)
                                                      ▼
                                     campaign_events (immutable log) + coupons.wa_status
```

**Division of responsibility (nothing duplicated):**

| Concern | System of record |
|---|---|
| Campaigns, scratch engine, prizes, coupons, QR, analytics events | EngageOS (unchanged) |
| Contacts, conversations/inbox, templates, broadcasts fan-out, automations, API keys | wacrm |
| Mapping only (contact id, wamid, broadcast id, encrypted key) | EngageOS integration tables |

**Untouched, per the integration rules:** authentication (`merchant-session`, `staff-session`, `admin-session`), `TenantRepository`, routing/proxy, the SQL scratch engine (`play_campaign`, `redeem_coupon`), analytics RPCs, and all existing business logic. The only edits to existing files: the sidebar nav href (`#` → `/m/whatsapp`) and two additive `after()` hooks in `/api/play` and `/api/staff/redeem`.

### New files

| Layer | Path |
|---|---|
| Migration | `supabase/migrations/0027_whatsapp_integration.sql` |
| Secrets crypto | `src/lib/wacrm/crypto.ts` |
| Wire types | `src/lib/wacrm/types.ts` |
| HTTP client | `src/lib/wacrm/client.ts` |
| Persistence | `src/lib/wacrm/store.ts` |
| Tenant facade | `src/lib/wacrm/adapter.ts` |
| Sync engine | `src/lib/wacrm/sync.ts` |
| Webhook receiver | `src/app/api/webhooks/wacrm/route.ts` |
| Adapter API | `src/app/api/m/whatsapp/{status,settings,contacts,contacts/opt-out,conversations,conversations/[id]/messages,broadcasts,analytics,dispatch}/route.ts` |
| UI | `src/app/m/whatsapp/page.tsx` + `src/components/merchant/whatsapp/*` (8 tabs) |

---

## 2. API Mapping (EngageOS ↔ wacrm Public API)

Auth: `Authorization: Bearer wacrm_live_…` per tenant. Required scopes: `messages:send`, `messages:read`, `contacts:read`, `contacts:write`, `conversations:read`, `broadcasts:send`, `webhooks:manage` (validated at connect time via `GET /api/v1/me`).

| EngageOS capability | wacrm endpoint | Notes |
|---|---|---|
| Verify key / account identity | `GET /api/v1/me` | Connect flow; account_id stored as tenant mapping |
| Contact sync (registration) | `POST /api/v1/contacts` | Find-or-create by phone; tags added via `PATCH /contacts/{id}` (union, since PATCH replaces) |
| Contacts tab | `GET /api/v1/contacts?search&tag&cursor` | Pass-through, cursor pagination |
| Coupon delivery / inbox reply | `POST /api/v1/messages` | `type: template` (coupon) / `type: text` (reply); wamid recorded in `wa_message_map` |
| Inbox tab | `GET /api/v1/conversations`, `GET /api/v1/conversations/{id}/messages` | Live read; nothing cached |
| Broadcasts | `POST /api/v1/broadcasts`, `GET /api/v1/broadcasts/{id}` | ≤1000 recipients/request → auto-chunked; no list endpoint → local launch ledger (`whatsapp_broadcasts`) + status polling |
| Delivery statuses | `POST /api/v1/webhooks` (register) → deliveries to `/api/webhooks/wacrm` | Events: `message.status_updated`, `message.received` |

**Not in wacrm's public API (by design, not duplicated):** template CRUD and automation CRUD are internal, session-authed wacrm routes. The Templates and Automation tabs therefore explain the model and deep-link into the tenant's own wacrm dashboard; templates are consumed **by name** for coupon delivery and broadcasts.

### EngageOS adapter surface (merchant-session-authed; browser → adapter → wacrm)

| Route | Purpose |
|---|---|
| `GET /api/m/whatsapp/status` | Connection health, quota, pending outbox |
| `POST/PATCH/DELETE /api/m/whatsapp/settings` | Connect (verify + webhook register + encrypt), coupon template config, disconnect |
| `GET /api/m/whatsapp/contacts` · `POST …/contacts/opt-out` | Contact list; opt-out (local flag + `opted-out` tag) |
| `GET /api/m/whatsapp/conversations` · `GET/POST …/[id]/messages` | Inbox read + reply |
| `GET/POST /api/m/whatsapp/broadcasts` | History w/ live count refresh; segment launch |
| `GET /api/m/whatsapp/analytics` | Real funnel from `campaign_events` + broadcast aggregates |
| `POST /api/m/whatsapp/dispatch` | Drain pending-coupon outbox (pairs with existing "Retry failed") |

---

## 3. Sync Flow

Everything originates from EngageOS's existing event pipeline — the SQL engine keeps writing `customer_events`/`campaign_events` exactly as before; the sync engine translates those moments outward and writes delivery facts back into the same immutable log. No event is ever emitted twice.

### Outbound (EngageOS → wacrm) — `src/lib/wacrm/sync.ts`

| Trigger (existing event) | Hook point | wacrm effect |
|---|---|---|
| `customer.registered` / `scratch.completed` (play) | `after()` in `/api/play` | Contact find-or-create by phone; tags: `engageos` + campaign slug |
| `prize.allocated` (customer won) | same | `winner` tag |
| `coupon.generated` | same | Optional template send (customer name, prize, code) — emits `whatsapp.queue` → `whatsapp.sent`/`whatsapp.failed`, sets `coupons.wa_status`, increments quota via `increment_wa_sent()` RPC |
| `coupon.redeemed` / `gift.claimed` | `after()` in `/api/staff/redeem` | `redeemed` tag |
| Customer opt-out | Contacts tab / opt-out route | `customers.wa_opt_out = true` + `opted-out` tag (public API has no archive; tag = suppression + CRM segment) |
| Customer segments | Broadcast tab | Segments (`all`, `winners`, `redeemed`, `campaign:<id>`) resolved from EngageOS plays/coupons at launch time — never mirrored into wacrm |
| `campaign.created` / `campaign.ended` | already in `campaign_events` | No wacrm resource for campaigns exists; campaign identity reaches the CRM as contact tags (per-campaign slug), which is what wacrm automations key on |

All hooks run **post-response** (`next/server` `after()`), are best-effort, and swallow errors: a CRM outage can never break a scratch, a redemption, or a merchant action. Auth failures flip the integration to `error` status, surfaced on the Overview tab.

### Inbound (wacrm → EngageOS) — `/api/webhooks/wacrm`

`message.status_updated` → `wa_message_map` lookup by wamid → status monotonically upgraded (out-of-order safe) → `whatsapp.delivered` / `whatsapp.read` / `whatsapp.failed` appended to `campaign_events` (actor `system`) → failed coupon deliveries flip `coupons.wa_status='failed'` so the existing "Retry failed" action + `campaign_stats_for_business` keep working unchanged. `message.received` needs no local state — the Inbox reads live.

### Delivery-status lifecycle

```
whatsapp.queue ─► whatsapp.sent ─► whatsapp.delivered ─► whatsapp.read
       │                │
       └──────────────► whatsapp.failed
(all five event types existed in migration 0016 — this integration is the first thing that actually emits sent/delivered/read/failed)
```

---

## 4. Tenant Model & Security

**One EngageOS merchant = one wacrm account.** The mapping lives in `business_integrations` (unique per `business_id`, keyed to wacrm `account_id`).

- **Encrypted keys.** API keys and webhook secrets are AES-256-GCM encrypted at the app layer (`WACRM_ENCRYPTION_KEY`, 32 bytes) before touching the database; only `api_key_last4` is ever shown. Keys never reach the browser.
- **No anon exposure.** All four new tables are RLS default-deny with grants revoked — deliberately a separate table rather than columns on `businesses` (which has an anon read policy).
- **Session-safe.** Every `/api/m/whatsapp/*` route requires `getTenantRepository()` (existing merchant session); wacrm calls always use *that tenant's* key, so cross-tenant access is structurally impossible — reinforced by wacrm's own account-scoped keys.
- **Webhook hardening.** HMAC-SHA256 over the raw body with per-tenant secret, constant-time compare, 5-minute replay window, tenant resolved by `account_id`, idempotency via per-delivery id (`wacrm_webhook_deliveries`).
- **No duplicate contacts.** wacrm find-or-creates by phone; EngageOS stores only `customers.wacrm_contact_id`.
- **Ownership guards.** `campaign:<id>` broadcast segments pass `repo.ownsCampaign()`; conversation replies resolve through the tenant's own wacrm account (foreign conversations 404).
- **Audit.** Connect/disconnect/broadcast/dispatch/opt-out all write `repo.audit()` + `campaign_events` entries.

---

## 5. Performance

- **Zero hot-path cost:** CRM sync runs via `after()` — the scratch response is sent before any wacrm I/O starts.
- **Quota enforcement:** hard ceiling checked before every send; atomic counter via `increment_wa_sent()` SECURITY DEFINER RPC (no read-modify-write race from concurrent plays).
- **Bounded fan-out:** broadcast recipient chunks of 1000 (wacrm cap); status refresh limited to 10 in-flight broadcasts per page load; dispatch drains ≤50 coupons per call.
- **15 s request timeout** on every wacrm call; wacrm's 120 req/min per-key rate limit surfaced as a typed `rate_limited` error.
- **Cursor pagination** passed through verbatim (keyset-based on the wacrm side).
- **Webhook processing is O(1)** per delivery: one indexed wamid lookup + one append.

---

## 6. Production Readiness

### Deploy checklist
1. Apply `supabase/migrations/0027_whatsapp_integration.sql`.
2. Set `WACRM_ENCRYPTION_KEY` (64 hex chars) in the EngageOS environment.
3. Ensure `NEXT_PUBLIC_APP_URL` is the public **https** origin (required for webhook registration).
4. On the wacrm deployment: apply its migration `028_webhook_endpoints.sql` (webhooks feature).
5. Per merchant: create a wacrm API key with the 7 scopes → paste into **/m/whatsapp → Settings**; create/approve a coupon template in wacrm and set its name in Settings (params: 1=name, 2=prize, 3=coupon code); toggle auto-send.

### Verified behaviors
- Connect flow validates the key (`/me`), checks all 7 scopes, registers the webhook, stores everything encrypted — with precise error messages for bad key / missing scopes / unreachable host.
- Not-connected state gates every CRM tab with a connect CTA; localhost deploys degrade gracefully (no webhook → statuses on poll only, clearly labeled).
- The previously-estimated WhatsApp overview (92% hardcoded) is replaced by real `campaign_events` counts end-to-end.

### Known limits (documented trade-offs)
- **Template/automation management** stays in wacrm's own UI (its public API doesn't expose them) — deep-linked, not duplicated.
- **Broadcast per-message statuses** aren't webhook-covered by wacrm (documented wacrm behavior); aggregate counts are polled instead.
- **wacrm webhook delivery is single-attempt** (wacrm roadmap has a durable queue); EngageOS reconciles via poll-on-view, and the outbox (`wa_status`) + "Retry failed"/"Send pending" cover misses.
- The play-time hook fires per request; a stampede of wins degrades to `pending` outbox entries on wacrm rate-limit (429 → `whatsapp.failed` → retryable), never to lost coupons.

### Follow-ups worth scheduling (not blockers)
- Cron-driven outbox drain (currently merchant-triggered via "Send pending").
- Inbound `message.received` → notification badge on the merchant shell.
- Broadcast recipient caps per plan tier.
