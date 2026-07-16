# Campaign Event Coverage Report — EngageOS v1.1

Single source of truth: `campaign_events` (append-only, immutable). Every event is
emitted **server-side only**. Tenant is always resolved from the session/service
context, never the client.

## Coverage matrix

| Action | Generated Event | Verified | Source File |
|---|---|---|---|
| Merchant creates a campaign | `campaign.created` | ✅ | src/app/m/campaigns/actions.ts:175 |
| Merchant edits campaign settings | `campaign.updated` | ✅ | src/app/m/campaigns/actions.ts:247 |
| Status → active (from draft/scheduled) | `campaign.activated` | ✅ | actions.ts:285 → statusEventType() |
| Status → active (from paused) | `campaign.resumed` | ✅ | actions.ts:285 → statusEventType() |
| Status → paused | `campaign.paused` | ✅ | actions.ts:285 → statusEventType() |
| Status → completed | `campaign.ended` | ✅ | actions.ts:285 → statusEventType() |
| Status → archived | `campaign.archived` | ✅ | actions.ts:285 → statusEventType() |
| Status → scheduled (publish) | `campaign.published` | ✅ | actions.ts:285 → statusEventType() |
| Merchant duplicates a campaign | `campaign.duplicated` | ✅ | src/app/m/campaigns/actions.ts:378 |
| Merchant deletes a campaign | `campaign.deleted` | ✅ | actions.ts:413 (campaign_id null, id in metadata) |
| Merchant opens campaign detail | `campaign.viewed` | ✅ | src/app/m/campaigns/[id]/page.tsx:40 |
| Retry WhatsApp queue | `whatsapp.queue` | ✅ | src/app/m/campaigns/actions.ts:446 |
| Print poster / generate QR | `qr.generated` + `poster.printed` | ✅ | src/app/m/[id]/campaigns/print/[slug]/page.tsx:104-121 |
| Customer scans QR | `customer.scan` | ✅ | migration 0018 → record_scan() |
| Customer registers | `customer.registered` | ✅ | migration 0018 → play_campaign() |
| Customer plays scratch | `scratch.completed` | ✅ | migration 0018 → play_campaign() |
| Prize allocated on win | `prize.allocated` | ✅ | migration 0018 → play_campaign() |
| Coupon issued on win | `coupon.generated` | ✅ | migration 0018 → play_campaign() |
| Real prize pool drained | `prize.exhausted` | ✅ | migration 0018 → play_campaign() (fires once) |
| Staff redeems coupon | `coupon.redeemed` | ✅ | migration 0018 → redeem_coupon() |
| Physical gift / voucher claimed | `gift.claimed` | ✅ | migration 0018 → redeem_coupon() |
| Merchant exports customers CSV | `customer.export` | ✅ | src/app/m/dashboard/customers.csv/route.ts |
| Merchant signs in | `merchant.login` | ✅ | src/app/m/login/actions.ts:111 |

## Immutability

- BEFORE UPDATE / BEFORE DELETE triggers raise exceptions — enforced in DB (migration 0016).
- `record_campaign_event` is the ONLY writer; SECURITY DEFINER, execute revoked from
  public/anon/authenticated. RLS is default-deny.

## Analytics — read from events, never recomputed

All served by SECURITY DEFINER RPCs (migration 0017), campaign-scoped ones enforce
tenant ownership via join to `p_business_id`:

- `campaign_activity_summary` — dashboard Campaign Health tiles
- `campaign_event_counts` — per-type rollup
- `campaign_timeline` (paginated, capped 200) — Campaign Timeline panel
- `campaign_conversion` — funnel + derived rates
- `campaign_performance` — per-campaign leaderboard (single round-trip, no N+1)
- `business_recent_events` — merchant dashboard + admin "Latest Activity" feed
- `campaign_daily_activity` — Daily Activity chart (IST-bucketed)
- `admin_campaign_timeline` — cross-tenant admin inspection

## Multi-tenant isolation

- Merchant surfaces resolve `business_id` from `TenantRepository.session` — never the client.
- Admin surfaces (`/admin/merchant/[slug]`) may read any tenant's log via
  `business_recent_events`; merchants can only read their own.

## Known gap (documented, deferred)

- WhatsApp delivery lifecycle (`whatsapp.sent/delivered/read/failed`) is still
  sourced from `coupons.wa_status`, not yet event-sourced. Tracked as GAP-3.
