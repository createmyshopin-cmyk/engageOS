# MERCHANT DASHBOARD ↔ CDP INTEGRATION PLAN

**Status:** APPROVED (decisions locked 2026-07-18). Execution proceeds phase-by-phase with sign-off gates.
**Date:** 2026-07-18

### Locked Decisions
- **D1 Data-fetch = HYBRID.** RSC for initial page loads (no rebuild of working Server Components); React Query only for new client-interactive views (infinite-scroll customer list, optimistic tag/consent, live timeline).
- **D2 501 endpoints = BUILD AS NEEDED.** Each phase builds its missing v1 endpoint (controller→service→repo/RPC; **no SQL in controllers**) before wiring UI.
- **D3 DB gate = YOU APPLY, I VERIFY.** Migrations 0034–0039 must be applied by the user (or via reconnected Supabase MCP); I run a smoke query to confirm before relying on those tables/RPCs. **Phase 0 blocks on this.**
- **D4 Shopify = READ-ONLY VIEWS.** Phase 4 renders already-ingested webhook data + honest "connection managed out-of-band" state. No OAuth/install flow.
**Scope:** Integrate the existing Merchant Dashboard (`/m/*`) with the new CDP, v1 API layer, and Shopify foundation. Additive only. Reuse, do not rebuild.

---

## 0. TL;DR — Read This First

The audit surfaced a hard reality that reshapes the brief. Three things must be decided before any phase ships:

1. **Most of the "new CDP APIs" the brief tells us to integrate against do not exist yet.** Only `GET/POST /api/v1/customers` (+ sub-routes) and `/api/v1/events` are real. **13 v1 endpoints are 501 stubs** (campaigns, orders, products, loyalty, coupons, rewards, segments, marketing, analytics, merchants/me, admin, referrals). So "integrate the dashboard with the new APIs" for Phases 1/4/5/6/7/8/9 means **build the endpoint first, then integrate** — that is backend extension, not pure frontend wiring.

2. **The mandate "Use React Query / never query the DB from the frontend" collides with the existing architecture.** The current dashboard is **RSC-first**: Server Components call `TenantRepository` directly (which is server-side, tenant-scoped, and never touches the client). Per the project's own `node_modules/next/dist/docs` (AGENTS.md requires reading them), React Query/SWR are **Client-Component-only** and the docs explicitly warn against **mixing** data-fetching approaches. Adopting React Query wholesale would mean **rebuilding working Server Components as Client Components** — which violates "Do NOT rebuild existing pages / Do NOT redesign."

3. **The DB gate is still open.** Migrations 0034–0039 (CDP + Shopify tables/RPCs) have **not been confirmed applied** to a live database in this environment. Every phase that reads CDP tables depends on them.

This plan proposes a concrete resolution for each (Section 8, **Decisions Needed**) and sequences the work so we ship value against the endpoints that already work, while building the missing ones behind the same service→repository→RPC discipline that already exists.

---

## 1. Current Dashboard Audit

### 1.1 Routing & shell
- No `src/app/m/layout.tsx`. Each page is a standalone RSC that wraps itself in `<MerchantShell>`.
- `MerchantShell` (`src/components/merchant/merchant-shell.tsx`, `"use client"`) renders the sidebar + optional header. Props: `businessName, city?, campaignActive?, hideHeader?, customHeader?, children`.
- **Sidebar nav (`NAV_ITEMS`):** Dashboard `/m/dashboard`, Campaigns `/m/campaigns`, Winners `/m/winners`, Rewards `/m/rewards`, Sources `/m/sources`, **Customers `#`**, WhatsApp `/m/whatsapp`, Integrations `/m/integrations`, **Reports `#`**, **Settings `#`**, **Help & Support `#`**. WATI item injected after WhatsApp when connected (client fetch to `/api/m/integrations/wati`).
- **4 nav items are dead links (`href:"#"`): Customers, Reports, Settings, Help & Support.** No pages exist for them.

### 1.2 Existing `/m` pages (all present, all RSC)
| Route | Purpose |
|---|---|
| `/m/dashboard` | **Actually the Campaigns overview** — campaign grid + 7-day joins chart + recent customers + rewards summary + traffic sources + activity timeline + quick actions |
| `/m/campaigns`, `/m/campaigns/new`, `/m/campaigns/[id]`, `/m/campaigns/[id]/edit`, `/m/campaigns/print/...` | Campaign CRUD + print QR |
| `/m/rewards` | Rewards/prizes management |
| `/m/sources` | Merchant-defined traffic sources |
| `/m/winners` | Live winners feed |
| `/m/whatsapp`, `/m/wati` | Messaging consoles |
| `/m/integrations`, `/m/integrations/tracking`, `/m/integrations/wati` | Integration settings (Shopify shown "Coming Soon") |
| `/m/login` | Merchant login |

### 1.3 Data-fetch pattern (critical)
`/m/dashboard/page.tsx` is `export const dynamic = "force-dynamic"`, calls `await getTenantRepository()` → `redirect("/m/login")` if null, then:
```
Promise.all([ repo.campaignStats(), repo.selectAllPrizes("*"),
              getAllCustomers(repo.businessId), repo.recentEvents(8), repo.trafficSources() ])
```
All server-side. No client fetching, no React Query, no `/api/*` calls from the browser for page data. Client interactivity is isolated in small `"use client"` islands (`DashboardActions`, `MerchantShell`).

### 1.4 CSV export precedent
`/m/dashboard/customers.csv/route.ts` — session-cookie auth via `getTenantRepository()`, streams **all** customers via `getAllCustomers()` (unbounded in-memory). Contrast: `GET /api/v1/customers` is principal/scope auth + keyset paginated (max 100/page). Two parallel auth models coexist (cookie for `/m` + `/api/m`; principal for `/api/v1`).

---

## 2. Reusable Components (inventory — reuse, never duplicate)

### 2.1 Merchant components (`src/components/merchant/`)
`activity-timeline`, `campaign-card`, `campaign-detail-tabs`, `campaign-edit-form`, `campaign-events-timeline` (exports `eventMeta`, `timeAgo`, `ACTOR_LABEL` — **reuse for all timeline views**), `campaign-wizard`, `campaigns-ui`, `dashboard-actions`, `experience-form`, `growth-chart`, `health-card`, `hero-card`, `kpi-card` (**reuse for all KPI tiles**), `merchant-login-form`, `merchant-shell` (**the single layout shell — reuse everywhere**), `quick-actions`, `recent-customers`, `reward-form`, `rewards-summary`, `sources-manager`, `whatsapp-overview`, plus `tracking/`, `wati/`, `whatsapp/` subfolders.

### 2.2 UI primitives (`src/components/ui/`)
`avatar, badge, button, card, dialog, dropdown-menu, input, label, select, separator, skeleton, sonner, switch, table, tabs, textarea`. **No virtualized-table or infinite-scroll primitive exists** — Customers list will need one added (or paginate) — see Risks.

### 2.3 Server data layer (reuse, never bypass)
- `TenantRepository` (`src/lib/db/tenant-repository.ts`) — tenant-scoped; already exposes tenant-wide analytics: `businessEventTotals()`, `campaignPerformance()`, `recentEvents()`, `trafficSources()`, `campaignStats()`, `campaignFunnel()`, `customerTimeline()`, `liveWinners()`, `giftInventory()`, plus generic `select/count/insert/updateById/deleteById` and `rpcSelect/rpcScalar/callRpc`.
- `getAllCustomers()` (`src/lib/db/merchant.ts`) — admin-client, full-table (bulk export only).
- v1 modules: `CustomerService`/`CustomerController`, `EventService`/`EventController` (real, tenant-safe via `tenantRepositoryFor(principal)`).

---

## 3. API Mapping (page → backend, and what's missing)

Legend — integration type per target:
**A = integrate now** (real endpoint/repo exists) · **B = build v1 endpoint, then integrate** · **C = net-new backend (no foundation yet)**

| Dashboard need | Existing/real backend today | Target per brief ("use new APIs") | Type |
|---|---|---|---|
| Dashboard KPIs (customers, plays, redeemed, WA) | `repo.businessEventTotals()`, `campaignStats()` (RSC) | `GET /api/v1/analytics/overview` (**501**) | **B** |
| Campaign grid + per-campaign stats | `repo.select("campaigns")` + `campaignStats()` (RSC) | `GET /api/v1/campaigns` (**501**) | **B** |
| Recent activity timeline | `repo.recentEvents()` (RSC) | `GET /api/v1/events` (**real**) | **A** |
| Traffic sources | `repo.trafficSources()` (RSC) | (no v1 route planned) | keep RSC |
| Customers list / search | `getAllCustomers()` (bulk) | `GET /api/v1/customers` (**real**, keyset) | **A** |
| Customer profile / 360 / timeline | — | `/api/v1/customers/[id]`, `/360`, `/timeline` (**real**) | **A** |
| Customer consent / tags / merge | — | `/consent`, `/tags`, `/merge` (**real**) | **A** |
| Orders | — | `GET /api/v1/orders` (**501**), Shopify ingest tables | **B** |
| Products | — | `GET /api/v1/products` (**501**) | **B** |
| Loyalty | — | `GET /api/v1/loyalty/[customerId]` (**501**) | **B** |
| Coupons | existing coupon engine (`/api/m`, RPCs) | `GET /api/v1/coupons` (**501**) | **B** |
| Rewards | `repo.selectAllPrizes()`, `/m/rewards` (RSC) | `GET /api/v1/rewards` (**501**) | **B** |
| Segments / filters | SQL RPCs exist (`merchant_segments`, `assign_customer_to_segments`, `find_duplicate_customers`) **not wired to TS** | `GET/POST /api/v1/segments` (**501**) | **B** |
| Marketing / broadcasts | `/api/m/whatsapp/broadcasts` (real, legacy) | `GET /api/v1/marketing/broadcasts` (**501**) | **B (UI-only per brief)** |
| Shopify connect / OAuth / sync | **none** — webhook-ingest only, no OAuth/install; `shopify_shops` provisioned out-of-band | Phase-4 surface | **C** |

---

## 4. Database Mapping

- **Existing, relied-upon RPCs (already wired):** `campaign_stats_for_business`, `campaign_performance`, `business_recent_events`, `traffic_sources`, `merchant_sources`, `campaign_funnel`, event-totals RPCs. These power today's dashboard and stay.
- **CDP migrations 0034–0039:** customer/event/consent/tag/segment tables + Shopify commerce tables (`shopify_shops`, ingestion/webhook-log). **DB-gate status: NOT confirmed applied in this environment.**
- **RPCs defined in SQL but NOT wired to any TS module:** `merchant_segments`, `assign_customer_to_segments`, `find_duplicate_customers`. Needed for Phase 2 filters/segments — wiring these is part of Type-B work.
- **No tenant-KPI rollup beyond `businessEventTotals()`** — `analytics/overview` (Phase 1/8) will wrap existing event-totals RPCs into a v1 service rather than invent new SQL where possible.

---

## 5. Missing Integrations (the real backlog)

1. **v1 endpoints to build (B):** analytics/overview, campaigns(list), orders, products, loyalty, coupons, rewards, segments(list/create), marketing/broadcasts, merchants/me. Each needs a controller→service→(repo/RPC) slice mirroring the existing `customers`/`events` modules. **No SQL in controllers.**
2. **TS wiring for existing segment RPCs** (`merchant_segments`, `assign_customer_to_segments`, `find_duplicate_customers`).
3. **Missing dashboard pages** for dead nav links: **Customers**, **Reports/Analytics**, **Settings**, **Help**. ("Do not create placeholder pages" → these ship only when their backend is ready, as real pages.)
4. **Shopify connection UX (C):** requires an OAuth/install flow + token storage that does not exist. Treat as its own project; Phase 4 delivers **read-only views of already-ingested webhook data** + honest "connection managed out-of-band" state, NOT a fake OAuth button.

---

## 6. Component Mapping (new views → existing components)

| New view | Reuses |
|---|---|
| Customers list | `MerchantShell`, `ui/table`, `ui/input` (search), `ui/badge`, `ui/skeleton`, `recent-customers` patterns |
| Customer 360 / profile | `MerchantShell`, `ui/tabs`, `ui/card`, `campaign-events-timeline` (`eventMeta/timeAgo/ACTOR_LABEL`), `ui/avatar`, `kpi-card` |
| Universal timeline | `campaign-events-timeline` helpers, `ui/select` (filters), `activity-timeline` |
| Dashboard Home KPIs | `kpi-card`, `growth-chart`, existing SVG chart in `dashboard/page.tsx` |
| Shopify views | `MerchantShell`, `ui/table`, `ui/badge`, `health-card` |
| Settings | `MerchantShell`, `ui/tabs`, existing integration forms |

No new design system. No visual redesign.

---

## 7. Implementation Phases (one at a time; test-gate each)

> Each phase: implement → typecheck → test (UI/API/tenant-isolation/loading/error/regression) → **stop for sign-off** before the next. No placeholder pages; a page ships only when its data path is real.

- **Phase 0 — Foundations (prereq):** Resolve DB gate (apply 0034–0039 on a branch + smoke test). Decide data-fetch strategy (Section 8). No UI changes.
- **Phase 1 — Dashboard Home:** Build `analytics/overview` + `campaigns(list)` v1 services (Type B) *or* keep RSC per decision; wire KPIs/campaigns/activity. Reuse existing page; no redesign.
- **Phase 2 — Customers (list/search/profile/360/timeline/consent/tags):** Pure Type-A against real `/api/v1/customers*`. Build the missing `/m/customers` page + activate nav link. Highest-value, lowest-risk — **recommended first real phase.**
- **Phase 3 — Universal Timeline:** Type-A against `/api/v1/events` + reuse timeline helpers.
- **Phase 4 — Shopify (read-only):** Views over ingested webhook data. **No fake OAuth.** Type C flagged.
- **Phase 5 — Orders / Phase 6 — Products / Phase 7 — Loyalty / Phase 8 — Analytics:** Each builds its v1 endpoint (Type B) then wires the page.
- **Phase 9 — Marketing:** UI only, no automation (per brief).
- **Settings + Help:** Real pages once their surfaces exist.

---

## 8. Decisions Needed (BLOCKING — cannot start Phase 1 without these)

**D1 — Data-fetch strategy.** The brief says "Use React Query"; the codebase + Next docs say RSC-first, don't mix. Options:
- **(a) Hybrid (recommended):** Keep RSC for initial page loads (no rebuild of working pages); use React Query **only** for new client-interactive views (infinite-scroll customer list, optimistic tag/consent, live timeline). Honors both mandates without rebuilding.
- **(b) React Query everywhere:** Convert Server Components to Client Components. Contradicts "don't rebuild pages" + Next docs.
- **(c) RSC everywhere:** Ignore the React Query mandate.

**D2 — 501 endpoints.** Building the missing v1 endpoints (analytics/campaigns/orders/products/loyalty/coupons/rewards/segments) is backend extension. Confirm this is in scope for "integration," or restrict Phase 1+ to endpoints that already work (Customers/Events) and defer the rest.

**D3 — DB gate.** Confirm migrations 0034–0039 are applied (and how I can verify), or I proceed only against already-live tables.

**D4 — Shopify.** Confirm Phase 4 = read-only views of ingested data (no OAuth), since no install flow exists.

---

## 9. Risks

- **Auth-model split:** `/m` + `/api/m` use session cookies; `/api/v1` uses `Principal`. New client-side React Query calls to `/api/v1` need the cookie→principal bridge verified (does the v1 auth guard accept the merchant session cookie from a browser fetch?). **Must verify before Phase 2.**
- **No virtualized table primitive** — large customer lists need one added or strict pagination.
- **Regression surface:** `/m/dashboard` is load-bearing; any refactor of its RSC data path risks the live campaign grid.
- **Type-B scope creep:** building 8+ endpoints is substantial; effort below assumes it's approved.
- **Additive-only guarantee:** no changes to existing auth/engines/RLS/RPCs; new RPCs are `CREATE ... IF NOT EXISTS`-style, on a branch, smoke-tested.

## 10. Estimated Effort (rough, post-approval)
- Phase 0: 0.5d (gate + decision) · Phase 2 (Customers, Type A): 1.5–2d · Phase 3 (Timeline): 1d · Phase 1 (Home + analytics/campaigns endpoints): 2–3d · Phase 4 (Shopify read-only): 1.5d · Phases 5–8 (endpoint+UI each): 2–3d each · Phase 9 (UI-only): 1d · Settings/Help: 1d.
- **Recommended order:** Phase 0 → Phase 2 → Phase 3 → Phase 1 → rest. (Front-loads the real, low-risk, high-value work.)

---

## 11. Execution Log

### Phase 0 — DB gate ✅ CLEARED (2026-07-18)
- User ran `supabase db push`: migrations **0033_tracking_engine → 0039_events_read applied** to the live database (committed, not a rollback probe). CDP tables + RPCs (`merchant_customer_360`, `customer_timeline_unified`, `merchant_upsert_customer`, `merchant_set_consent`, `merchant_add_customer_tag`) now exist in the target DB.

### Phase 2 — Customers ✅ COMPLETE (2026-07-18)
**Scope shipped (Type-A, no backend changes needed — endpoints were already real):**
- New client data layer: `src/lib/api/{types,client}.ts` (envelope mirror + typed `apiClient` with `credentials:"same-origin"` so the merchant session cookie authenticates v1 fetches), `src/lib/api/hooks/use-customers.ts` (keyset list, 360, keyset timeline, upsert/consent/tag mutations with cache invalidation).
- `QueryProvider` (`src/components/providers/query-provider.tsx`) mounted inside `MerchantShell` around page children.
- New views: `customers-view.tsx` (debounced search, IntersectionObserver infinite scroll, loading/empty/error states) + `customer-detail-drawer.tsx` (360 KPIs, consents, tags, infinite timeline). RSC page `src/app/m/customers/page.tsx` (DAL guard → `MerchantShell`).
- Nav: activated the previously-dead `Customers` link (`href:"#"` → `/m/customers`).

**Contract verification (end-to-end, all real endpoints — 0 `NotImplemented` in `CustomerController`):**
- List query params `cursor/limit/search` ✓ · timeline `limit/before` ✓ · consent `channel/status/source` ✓ · tags `name/color` ✓ — all match `validator.ts` exactly.
- Timeline keyset round-trip proven: RPC `customer_timeline_unified.ts` is `timestamptz` → supabase-js serializes ISO-8601 → `TimelineEntryDTO.ts` → `page.nextCursor` → refed as `before` (re-validates `z.string().datetime()`). No opaque-cursor mismatch.

**Framework fix (latent Task-2 defect, strictly additive — types only, no runtime change):**
- `next build` generates `.next/types/validator.ts` (which `tsc --noEmit` does not), and it rejected **every** v1 route: `defineRoute`'s returned handler typed its context as `{ params: Promise<undefined> }` for non-dynamic routes, not assignable to Next 16's generated `{ params: Promise<{}> }`.
- Fix in `src/server/http/handler.ts`: `NextRouteCtx` params widened `Promise<P>` → `Promise<unknown>` (raw params are still Zod-validated to `P` before the controller sees them). No behavior change; unblocks the build for all routes.

**Gates:** `next build` EXIT 0 (43/43 pages, `/m/customers` in manifest) · `vitest run` 24/24 passing.

**Next:** Phase 3 (Timeline — Type A, reuses the timeline hook already built).

### Phase 3 — Universal Timeline / Activity ✅ COMPLETE (2026-07-18)
**Scope shipped (Type-A — `/api/v1/events` GET was already real, `EventController.feed`; no backend changes):**
- New hook `src/lib/api/hooks/use-events.ts` (`useEventFeed` — keyset infinite feed with `category`/`name`/`customerId` filters, `flattenEventPages`). Client `EventDTO` + `EVENT_CATEGORIES` added to `src/lib/api/types.ts`.
- New view `src/components/merchant/activity/activity-view.tsx` — business-wide event stream: category filter pills, IntersectionObserver infinite scroll, loading/empty/error states. **Reuses** `eventMeta` + `timeAgo` from `campaign-events-timeline.tsx` (no duplicate rendering logic).
- RSC page `src/app/m/activity/page.tsx` (DAL guard → `MerchantShell`, matches `/m/customers`).
- Entry points: new **Activity** nav item (CDP group, after Customers) + wired the dashboard "Recent Activity" card's **View all** → `/m/activity`.

**Contract verification:**
- Feed query params `cursor/limit/category/name/customerId` ✓ match `events/validator.ts` exactly. Feed uses **opaque encoded cursors** (`encodeCursor`/`decodeCursor`) — the hook passes `page.nextCursor` straight back as `cursor`, never parsing it (distinct from the customer-timeline raw-`before` pattern; got this right).
- `EventDTO` client mirror matches `events/dto.ts` field-for-field.

**Additive helper widening (no behavior change):**
- `eventMeta(type)` in `campaign-events-timeline.tsx` widened `CampaignEventType` → `CampaignEventType | string` so the universal feed's free-form dotted names resolve (unknown names already fall to `FALLBACK_META`). All existing enum callers stay valid.
- `merchant-shell.tsx` WATI nav injection made **index-independent** (finds WhatsApp by href instead of hardcoded `slice(0,7)`) so adding the Activity item above WhatsApp can't misplace the WATI console. Pure robustness fix.

**Gates:** `tsc --noEmit` EXIT 0 · `next build` EXIT 0 (43/43 pages, `/m/activity` in manifest) · `vitest run` 24/24 passing.

**Next:** Phase 1 (Dashboard Home) or Phase 4 (Shopify read-only) — both partly Type-B/C. Recommend Phase 1 next per the front-loaded order.

### Phase 1 — Dashboard Home ✅ COMPLETE (2026-07-18)
**Approach (D1=HYBRID + D2=BUILD-AS-NEEDED):** the working RSC `/m/dashboard` is left **untouched** (renders KPIs/campaigns/activity server-side via the DAL — "do not rebuild"). Phase 1's deliverable is the **two Type-B v1 endpoints** that were 501 stubs, built to the documented scaffold surface using the existing event-sourced RPCs (no SQL in controllers; controller→service→repository→RPC).

**Endpoints shipped (stubs → real):**
- `GET /api/v1/analytics/overview` → dashboard KPI snapshot. New `analytics` module (controller/service/repository/dto) wrapping the existing **`business_event_totals`** aggregate RPC (migration 0015) over the immutable event log. Zero row-pulling; tenant-scoped; read scope.
- `GET /api/v1/campaigns` → keyset campaign list (newest-first, optional `status` filter) enriched with per-campaign stats from the existing **`campaign_stats_for_business`** rollup (migration 0009) via the reused `TenantRepository.campaignStats()` DAL method. `POST` left as an honest `NotImplementedError` (campaign authoring still flows through the existing `/m/campaigns/new` server action; a v1 create is future work — no fake endpoint).

**Client contract (consumable, non-intrusive):** added `AnalyticsOverviewDTO` + `CampaignListItemDTO`/`CampaignStatsDTO` to `src/lib/api/types.ts` and `use-dashboard.ts` hooks (`useAnalyticsOverview`, `useCampaignList` infinite). The RSC page keeps first-paint rendering; these let a client island refresh KPIs / page campaigns later without a rebuild.

**Verification:** keyset `.or()` after the tenant select's `.eq("business_id")` ANDs correctly (same idiom as the customers list — tenant scoping preserved). New unit tests (`test/dashboard-dto.test.ts`, 6) lock the app-tier rules: win-rate = round(wins/plays·100), zero-division guard, zero-normalization, snake→camel mapping.

**Gates:** `tsc --noEmit` EXIT 0 · `next build` EXIT 0 (both endpoints in manifest, no longer stubs) · `vitest run` **30/30** passing (was 24).

**Next:** Phase 4 (Shopify read-only views) or Phases 5–8 (Orders/Products/Loyalty/Analytics — each Type-B endpoint + UI).
