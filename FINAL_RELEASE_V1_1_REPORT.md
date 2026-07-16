# EngageOS — Release V1.1 Final Feature Build Report

**Date:** 2026-07-16
**Status:** ✅ Complete — `tsc --noEmit` clean, `next build` clean
**Architecture constraint:** FROZEN foundation honored — no changes to auth, tenant repository contract, routing model, or database foundation. All work is additive.

---

## Summary

Three production features were delivered on top of the frozen architecture, using the sanctioned data path (`TenantRepository` + SECURITY DEFINER RPCs), the immutable event logs (`customer_events`, `campaign_events`), and the existing audit log.

| Feature | Backend | Merchant UI | Customer UX | Events |
|---|---|---|---|---|
| 1 — Campaign Rewards Manager | ✅ (0022 + reward actions) | ✅ inline `RewardsManager` | ✅ reward image/name/code on win | `reward.created/updated/deleted` |
| 2 — Traffic Sources | ✅ (0023 registry + RPCs) | ✅ `/m/sources` | n/a (`?src=` tracked) | `source.created/deleted`, `qr.downloaded` |
| 3 — Post Win Experience | ✅ (0023 columns + RPC) | ✅ Post Win tab | ✅ countdown + deep-link redirect | `redirect.enabled/disabled/updated/started/opened/completed/cancelled`, `reward.viewed` |

---

## Migration 0023 (`supabase/migrations/0023_release_v1_1_features.sql`)

Additive, non-destructive. Lockdown matches the rest of the schema: RLS default-deny, grants revoked from `anon`/`authenticated`, writers `SECURITY DEFINER`.

1. **Extended `campaign_events` CHECK** — superset adds the 15 V1.1 event types (reward.*/source.*/redirect.*/reward.viewed/claimed). Existing rows stay valid.
2. **Post Win columns on `campaigns`** — `redirect_enabled`, `redirect_delay` (0/3/5/10/15/30), `redirect_destination_type` (none/website/product/instagram/facebook/youtube/tiktok/whatsapp/telegram/custom), `redirect_url` (≤2048). All defaulted → existing campaigns unaffected (redirect off).
3. **`campaign_display`** — `CREATE OR REPLACE` adds a `redirect` jsonb object; every prior field and the (merchant_slug, campaign_slug) resolution is verbatim.
4. **`merchant_update_redirect`** — ownership enforced by the campaign→business join in SQL; raises if not owned.
5. **`campaign_sources`** table — business-scoped named-source registry, `slug` unique per business, `^[a-z0-9_-]{1,40}$`.
6. **`merchant_create_source` / `merchant_delete_source`** — ownership-checked mutators.
7. **`merchant_sources`** — registry LEFT JOINed with live `customer_events` aggregates (scans/registrations/plays/wins/redemptions) in one round-trip; sources with no traffic still appear.

---

## Feature 1 — Campaign Rewards Manager

- Reward CRUD via `src/app/m/campaigns/[id]/rewards/actions.ts` (Zod-validated: name, type, description, image_url, background_color, quantity, weight, expiry, prize_value, is_fallback).
- Images upload tenant-isolated to `business_id/campaigns/…` via `/api/m/rewards/upload` (2MB, png/jpeg/webp).
- UI: inline `RewardsManager` in `campaign-detail-tabs.tsx` (thumbnail, type badge, inventory bar, add/edit/delete modal). **Duplicate external component removed** to honor "no parallel implementations."
- Customer sees reward image/name/coupon on win (`play-flow.tsx`).
- Events: `reward.created` / `reward.updated` / `reward.deleted` + audit entries.

## Feature 2 — Traffic Sources

- `/m/sources` page + `SourcesManager` client component: create/list/delete named sources, per-source tracked-URL builder and downloadable QR (client-side `qrcode`).
- Nav item added to `merchant-shell.tsx`.
- Actions in `src/app/m/sources/actions.ts`: slug normalized to match `normalizeSource` (the `?src=` analytics key), so registry names line up with logged traffic.
- Dashboard Traffic Sources panel (0020 aggregate) already surfaces Source/Scans/Registrations/Plays/Wins/Redeemed; the merchant-facing `merchant_sources` RPC adds Conversion.
- Events: `source.created` / `source.deleted` + `qr.downloaded` on QR download + audit entries.

## Feature 3 — Post Win Experience

- **Merchant:** Post Win tab (`PostWinForm`) — enable toggle, delay selector (Instant/3/5/10/15/30s), destination type, conditional URL with http(s) validation, live preview. Wired to `updateRedirectAction` which records `redirect.enabled` vs `disabled` vs `updated` by diffing prior state.
- **Customer:** `RedirectCountdown` in `play-flow.tsx` — after Scratch → reward reveal → reward image/details, a countdown runs then opens the destination (native deep-link first via `buildDeepLink`, always with an HTTPS fallback so the customer is never blocked). Controls: **Open Now / Stay Here**, plus re-open after cancel.
- Events via best-effort beacon → `POST /api/experience` (`recordExperienceEvent`, business_id resolved server-side from campaign, customer-safe allow-list): `reward.viewed`, `redirect.started/opened/completed/cancelled`.

---

## Event & Audit Coverage

- **Merchant actions** → `campaign_events` (reward.*, source.*, redirect.*) + `audit_log` via `repo.audit(...)`.
- **Customer experience** → `campaign_events` as `customer` actor, tenant-safe (server-resolved business_id).
- All event recording is best-effort and never blocks the underlying mutation or the customer flow.

## Verification

- `npx tsc --noEmit` — ✅ no errors.
- `npx next build` — ✅ compiled; new routes `/api/experience` and `/m/sources` present.

## Files Touched

**New:** `supabase/migrations/0023_release_v1_1_features.sql`, `src/app/m/sources/page.tsx`, `src/app/m/sources/actions.ts`, `src/components/merchant/sources-manager.tsx`, `src/app/api/experience/route.ts`.
**Edited:** `src/lib/types.ts`, `src/lib/db/tenant-repository.ts`, `src/lib/db/rpc.ts`, `src/app/m/campaigns/actions.ts`, `src/app/m/campaigns/[id]/page.tsx`, `src/app/m/campaigns/[id]/rewards/actions.ts`, `src/components/merchant/campaign-detail-tabs.tsx`, `src/components/merchant/merchant-shell.tsx`, `src/components/play/play-flow.tsx`.

## Deployment Note

Migration `0023_release_v1_1_features.sql` must be applied before deploy (adds columns/tables/RPCs the new UI reads). It is additive and safe on existing data.
