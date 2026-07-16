# EngageOS — Release V1.1 Final Master Build Report

**Date:** 2026-07-16
**Status:** ✅ Complete — `npx tsc --noEmit` clean, `npx next build` clean
**Architecture constraint:** FROZEN foundation honored. No changes to authentication, tenant repository contract, database foundation, routing, scratch engine, prize engine, analytics engine, customer events, campaign events, or audit log. Every change is additive (new columns, new SECURITY DEFINER RPCs, new UI).

---

## 1. Architecture

Three production features were delivered on the sanctioned data path only:

- **Data access:** `TenantRepository` (auto-scoped to the session's `business_id`) + SECURITY DEFINER RPCs. The raw service-role client is never exposed to merchant code.
- **Event sourcing:** append-only `customer_events` and `campaign_events`; writers `record_customer_event` / `record_campaign_event`. `audit_log` via `record_audit_event`.
- **Prizes** carry no `business_id`; tenant safety is enforced by an FK inner-join on `campaigns.business_id`, so a foreign `campaign_id` yields zero rows even without a prior ownership check.
- **No parallel implementations:** the inline `RewardsManager` is the single reward UI; the duplicate external component was removed in the prior pass.

New migrations (additive, RLS default-deny, grants revoked from `public`/`anon`/`authenticated`):

| Migration | Adds |
|---|---|
| `0023_release_v1_1_features.sql` | Post Win columns + `merchant_update_redirect`, `campaign_sources` + source RPCs, `campaign_display.redirect`, event CHECK superset |
| `0024_reward_lifecycle.sql` | prize `badge` / `sort_order` / `priority` / `is_active` / `active_weight`; `merchant_set_prize_active`, `merchant_duplicate_prize`; extended `merchant_update_prize`; `reward.enabled/disabled/duplicated` + `qr.printed` events |
| `0025_v1_1_analytics.sql` | `reward_performance()`, `redirect_analytics()` read-only aggregates |

**Deployment note:** apply `0024` and `0025` before deploy. Both are additive and safe on existing data.

## 2. Security

- **Redirect URL gate — `isSafeRedirectUrl()` (`src/lib/validation.ts`).** Only `https://` is allowed. Rejected: `javascript:` / `file:` / `data:` / `blob:` / non-TLS `http:`, and hosts `localhost`, `*.local`, `127.0.0.0/8`, `10/8`, `172.16–31`, `192.168/16`, `169.254/16` (link-local), `0.0.0.0`, IPv6 `::1` / `fc..` / `fd..` / `fe80..`. Enforced in two places: server-side in `redirectSchema` (`src/app/m/campaigns/actions.ts`) so a bad URL can never be saved, and client-side as a final gate in `RedirectCountdown.open()` (`play-flow.tsx`) so a stale/tampered value never navigates the customer.
- **Tenant isolation:** every new RPC takes `p_business_id` from the session (never the URL) and joins `campaigns.business_id` for ownership. Customer-facing experience events resolve `business_id` server-side from the campaign, so a customer cannot attribute to another tenant.
- **Reward image storage** stays tenant-isolated under `business_id/…` via the existing signed upload route (2 MB, png/jpeg/webp).

## 3. Tracking (Events)

**Campaign events** (`campaign_events`, actor = merchant/admin):
`reward.created` · `reward.updated` · `reward.deleted` · `reward.duplicated` · `reward.enabled` · `reward.disabled` · `source.created` · `source.deleted` · `redirect.enabled` · `redirect.disabled` · `redirect.updated` · `qr.downloaded` · `qr.printed` (+ existing `qr.generated`, `poster.printed`).

**Customer / experience events** (via best-effort `POST /api/experience`, allow-listed, server-resolved tenant):
`reward.viewed` · `redirect.started` · `redirect.opened` · `redirect.completed` · `redirect.cancelled` (+ `reward.claimed` reserved). The frozen play engine already emits `qr_scan`, `registration`, `scratch`, `prize_won`, `coupon_issued`, `coupon_redeemed`.

All event writes are best-effort and never block the mutation or the customer flow.

## 4. Analytics

| Requirement | Source | Surface |
|---|---|---|
| Traffic Sources (Scans/Registrations/Plays/Wins/Redeemed/Conversion) | `merchant_sources` / `traffic_sources` | `/m/sources` table |
| Most Scanned / Top Converting Source | `merchant_sources` (sortable metrics) | `/m/sources` |
| Reward Performance / Top Rewards / Inventory Remaining | `reward_performance()` | Campaign → Analytics → Reward Performance panel |
| Redirect CTR (opens/views) | `redirect_analytics()` | Analytics → Post Win Redirect panel |
| Redirect Completion (completes/starts) | `redirect_analytics()` | same panel |
| Most Visited Link | `redirect_analytics().most_visited` | same panel |
| Conversion Funnel | `campaign_funnel` (frozen) | Analytics → Conversion Funnel |

## 5. Rewards

Full CRUD + lifecycle on the inline `RewardsManager`:
- **Add / Edit / Delete / Duplicate / Enable / Disable.** Duplicate clones into the same campaign, starts **disabled** and out of the draw (`weight 0`) with a “(Copy)” suffix so it can't win before review.
- **Enable/Disable** parks/restores the draw weight in `active_weight`, so the frozen `play_campaign` draw (which filters `weight > 0`) excludes disabled rewards with no engine change.
- **Properties:** Name, Image, Description, Quantity, Remaining, Weight, Priority, Background Color, Badge, Sort Order, Status. Reward Types: Coupon, Physical Gift, Gift Voucher, Wallet Points, Cashback, Lucky Draw Entry.
- **Customer win screen** shows reward image, name, description, and coupon/voucher code.

## 6. Traffic Sources

- `/m/sources`: create/list/delete named sources; each yields a `?src=` tracked URL and a client-side downloadable QR. Slug normalized to match `normalizeSource` (the `?src=` analytics key) so registry names align with logged traffic.
- Per-source funnel + conversion via `merchant_sources`. Events: `source.created` / `source.deleted` + `qr.downloaded`.

## 7. Redirect Engine (Post Win)

- **Merchant:** Post Win tab — Enable/Disable, Redirect Delay (0/3/5/10/15/30 s), Destination (Instagram/Facebook/YouTube/TikTok/WhatsApp/Telegram/Website/Shopify Product/Custom URL), conditional URL with the safe-URL gate, live preview. `updateRedirectAction` records `redirect.enabled/disabled/updated` by diffing prior state.
- **Customer:** Scratch → Gift Reveal → Reward Image/Name/Description → Countdown → auto redirect. Native deep-link attempted first via `buildDeepLink` (`instagram://`, `whatsapp://`, `tg://`, `vnd.youtube://`), always with an HTTPS fallback so the flow never breaks. Controls: Open Now / Stay Here / re-open after cancel.

## 8. Storage

Reward images upload tenant-isolated to `business_id/…` in the `reward-images` bucket (migration 0022), 2 MB cap, png/jpeg/webp, served by URL on the customer win screen.

## 9. Performance

- Campaign detail page fetches all panels (prizes, funnel, totals, timeline, activity, reward performance, redirect analytics, WA counts) in a single `Promise.all` — no N+1.
- Aggregates are single-round-trip SQL RPCs. Experience events use `navigator.sendBeacon` (non-blocking).

## 10. Multi-Tenant

Every read/write is scoped by session `business_id`. New RPCs enforce ownership via the `campaigns.business_id` join; foreign IDs return zero rows / raise “access denied”. Customer experience events cannot cross tenants (business_id resolved server-side).

## 11. Production Readiness

- `npx tsc --noEmit` — ✅ no errors.
- `npx next build` — ✅ compiled; routes `/api/experience`, `/m/sources`, `/m/campaigns/[id]` present.
- All mutations audit-logged; all events append-only.

## 12. Coverage

| Area | Status |
|---|---|
| Reward Add/Edit/Delete/Duplicate/Enable/Disable | ✅ |
| Reward properties (badge/sort/priority/status/color/image) | ✅ |
| Traffic Sources + per-source analytics | ✅ |
| Post Win redirect engine + deep-links | ✅ |
| Redirect URL security (https-only, block dangerous/local/private) | ✅ |
| Campaign + customer events | ✅ |
| Merchant analytics (reward/redirect/source) | ✅ |
| Audit log on all merchant actions | ✅ |

## 13. Known Limitations

- **Source editing:** create/delete only; `source.updated` event type exists but there is no edit UI yet.
- **WhatsApp lifecycle** counts remain `wa_status`-sourced (not yet event-sourced) — pre-existing GAP-3, deferred.
- **`reward.claimed`** event type is reserved in the allow-list but not yet emitted (claim is currently a physical counter action).
- **Redirect analytics** attribute the most-visited link from `redirect.opened` metadata; requires the migration's events to accrue before panels populate.

## 14. Future Roadmap

- Source edit UI + `source.updated` wiring.
- Event-source the WhatsApp delivery lifecycle.
- Per-source reward-performance cross-tab.
- Scheduled reward activation windows (start/end per reward).
- A/B redirect destinations with CTR comparison.

---

### Files Touched (V1.1 Master Build pass)

**New:** `supabase/migrations/0024_reward_lifecycle.sql`, `supabase/migrations/0025_v1_1_analytics.sql`.
**Edited:** `src/lib/validation.ts`, `src/lib/types.ts`, `src/lib/db/tenant-repository.ts`, `src/app/m/campaigns/actions.ts`, `src/app/m/campaigns/[id]/page.tsx`, `src/app/m/campaigns/[id]/rewards/actions.ts`, `src/app/m/campaigns/print/[merchantSlug]/[campaignSlug]/page.tsx`, `src/components/merchant/reward-form.tsx`, `src/components/merchant/campaign-detail-tabs.tsx`, `src/components/merchant/campaign-events-timeline.tsx`, `src/components/play/play-flow.tsx`.
