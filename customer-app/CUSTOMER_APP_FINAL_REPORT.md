# CUSTOMER_APP_FINAL_REPORT

EngageOS V2 — Customer Experience Application, final production build.
Date: 2026-07-16

## Architecture

```
customer-app/            Vite 8 + React 19 + TS (standalone, PWA)
  src/components/        Preloader, BrandHeader, RegisterForm, ScratchCard,
                         PrizeReveal, Confetti, RedirectCountdown, SmartImage,
                         ErrorScreen
  src/pages/             CampaignPage (lazy), NotFound (lazy)
  src/hooks/             useCampaign, usePreloaderGate, useNetwork
  src/services/api.ts    campaign_display RPC / /api/play / /api/experience
  src/store/playStore.ts Zustand journey state machine
  src/utils/             validation mirrors, deep links, haptics, sound
```

Existing backend consumed as-is: `campaign_display` (anon RPC), `POST /api/play`, `POST /api/experience`. No parallel implementations; all draw/coupon/tracking logic stays server-side.

**Additive backend surface for the new merchant settings** (no existing object modified beyond the sanctioned extension pattern used by 0022→0023):
- `supabase/migrations/0026_customer_experience.sql` — `exp_*` columns on `campaigns` (all defaulted; existing campaigns unaffected), `campaign_display` re-created verbatim + one new `experience` object, `merchant_update_experience` RPC (service-role only, tenant ownership enforced in SQL — same pattern as `merchant_update_redirect`).
- `TenantRepository.updateExperience()` — new method; repository pattern untouched.
- `updateExperienceAction` — new server action (zod-validated, `ownsCampaign` guard, audit + `settings.updated` campaign event; no new event types invented).
- Campaign Settings → new **Customer Experience** tab (`experience-form.tsx`).

## Merchant Dashboard — Customer Experience section

| Setting | Options | Default |
|---|---|---|
| Enable Preloader | on/off | on |
| Preloader Duration | 300 / 600 / 1000 ms | 600 |
| Confetti Animation | on/off | on |
| Reward Sound | on/off | **off** |
| Haptic Feedback | on/off | **off** |
| Open Native App | on/off | on |
| Show Countdown | on/off | on |
| Allow Customer To Skip | on/off | on |
| Button Text | free text ≤30 chars (presets: Follow Us / Visit Website / Shop Now) | "Open Now" |
| Theme | Light / Dark / Merchant Brand | Dark |

(Auto Redirect on/off, Redirect Delay 0–30s, Destination incl. Shopify product / custom URL, and HTTPS-only URL validation already exist in the **Post Win** tab from V1.1 — not duplicated.)

Customer app consumes `campaign_display.experience` with safe defaults (`DEFAULT_EXPERIENCE`) so it runs correctly even before migration 0026 is applied.

## Performance

| Metric | Target | Result |
|---|---|---|
| App bundle (route JS excl. framework vendor) | <100 KB gzip | **~21.6 KB gzip** (index 9.1 + CampaignPage 11.1 + runtime 0.4 + confetti 0.7 lazy) |
| Framework vendor (react/dom/router) | — | 90.1 KB gzip, content-hashed, cache-stable |
| CSS | — | 4.5 KB gzip |
| First paint | <700ms | inline HTML/CSS spinner paints at TTFB+~50ms |
| Interactive | <2s | ~116 KB gzip total JS on 4G |
| Layout shift | none | dimensioned images, fixed-inset overlays |
| Build | clean | `tsc --noEmit` ✅ (both apps), `vite build` 1.3s ✅, `next build` ✅ no errors |

## Preloader

Boot spinner inline in HTML (zero-JS first paint, never blank white) → branded preloader: logo soft-pulse + merchant name + campaign name + loading dots → 180ms fade-out the instant data is ready. Minimum display = merchant-configured 300/600/1000ms; merchant can disable it entirely (drops out on data-ready).

## Scratch Engine (unchanged core, now merchant-tunable haptics)

Canvas `destination-out` over DOM prize layer; coalesced pointer events (60fps strokes); alpha sampling every 8th pixel inside rAF; DPR ≤2 (1 in Low Internet Mode → ~¼ canvas memory); `touch-action:none` + pointer capture; haptics only when merchant enables them.

## Prize Reveal / Confetti

Reward image (blur-up), name, worth ₹, coupon code panel, claim hint per prize type, expiry. Confetti: 90-particle canvas burst — not fireworks — GPU-friendly fillRect quads, auto-stops at 2.6s, cancels on unmount, lazy chunk prefetched during scratch, skipped when merchant disables it or Low Internet Mode is active. Optional reward chime: 3-note Web-Audio synth (C5-E5-G5, ~0 bytes network), merchant-gated, default off.

## Countdown & Redirect Engine

SVG stroke-ring 3-2-1 countdown (merchant can hide) → "Opening Instagram…" → native deep link (instagram/youtube/whatsapp/telegram; merchant can force browser-only) → 700ms HTTPS fallback via `visibilitychange` → recovery hint. Custom button text; Stay Here shown only when skip is allowed; delay 0 = instant. Tracks `redirect.started/opened/completed/cancelled` through the existing `/api/experience` endpoint only.

## Security

- Tenant isolation: `merchant_update_experience` binds campaign→business in SQL; dashboard action re-checks `ownsCampaign`; customer app carries no tenant identifiers beyond public slugs.
- Redirects: HTTPS-only, private/loopback hosts rejected client-side (mirror of server `isSafeRedirectUrl`), only whitelisted native URL schemes (`instagram://`, `vnd.youtube:`, `whatsapp://`, `tg://`), `noopener` on all opens.
- No client trust: prize outcome, coupon issue, rate limiting all server-side in `/api/play`; experience beacons are best-effort and resolve business_id server-side from the campaign.
- Session-safe: customer flow is anonymous; no merchant/staff session ever touched.

## Network Layer

10s timeout, keyed duplicate-abort, retries (2× reads / 1× play, never 4xx), sessionStorage offline beacon queue (cap 20) flushed on reconnect, `sendBeacon` → `fetch keepalive` fallback.

## Low Internet Mode

`effectiveType` slow-2g/2g/3g or Save-Data → animations off (`data-lowmotion`), no confetti/glow, DPR-1 canvas, no speculative image preload; offline → dedicated screen + queued beacons. Interaction never blocked.

## Error Experience

Friendly screens for: campaign expired/unavailable, already played, all prizes claimed, rate limited, no internet (📶 + retry), slow internet (🐢 + retry), server busy (⏳ + retry), 404. No raw errors surface anywhere.

## Tracking (existing pipes only)

- Server-side via `/api/play`: scan → registered → scratch → prize/coupon events (`customer_events` + `campaign_events`).
- Client beacons via `/api/experience`: `reward.viewed`, `redirect.*` — all already in the 0023 event-type check constraint.
- Merchant settings writes: `audit_log` (`experience.update`) + `campaign_events` (`settings.updated`).

## PWA / Caching

Precache 14 entries (shell); runtime: images CacheFirst 7d, fonts CacheFirst 30d, campaign RPC NetworkFirst (4s → 24h fallback); `autoUpdate` SW; standalone manifest; `/api/*` never navigation-fallback'd. Repeat open: shell+logo+reward art from cache.

## Theme

Merchant-selectable: Dark (default), Light (CSS variable swap via `data-theme`), Merchant Brand (dark surface + accent adapted from first reward's `background_color`). Brand accent drives buttons, ring, glow, dots, focus states everywhere.

## Device Matrix

| Target | Expectation |
|---|---|
| Android Chrome / Samsung Internet | Full experience incl. network detection, haptics |
| iPhone Safari | No `navigator.connection` → fast tier; haptics/sound degrade silently; pointer events + safe-area OK |
| Low-end Android | Low Internet Mode auto-engages on slow networks; DPR-1 canvas |
| 3G | Auto low mode; NetworkFirst timeout 4s |
| Offline repeat visit | Shell from SW; beacon queue |
| Portrait / Landscape | Fluid max-w-md + dvh + safe-area |

## Lighthouse

Structured for 100/100/100 (Perf/A11y/BP): inline first paint, ~26 KB gzip route payload, preloaded LCP logo, no CLS, labelled controls, reduced-motion support, HTTPS-only external opens. **Lab verification requires a deployed HTTPS origin** — run Lighthouse post-deploy; local preview confirms 200s on route/sw/manifest.

## Production Readiness

- [x] `tsc --noEmit` clean — customer app **and** Next.js dashboard
- [x] `vite build` clean (1.3s) — app code ~21.6 KB gzip (<100 KB target)
- [x] `next build` clean — no errors
- [x] Preview smoke test: route 200, sw.js 200, manifest 200
- [x] Backend/auth/tenant repository/business logic untouched (additive-only migration + repo method + action, per the 0022→0023 precedent)
- [ ] Apply migration `0026_customer_experience.sql` to Supabase
- [ ] Deploy customer app same-origin with the API (or add CORS to `/api/play` + `/api/experience`); set `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
- [ ] Replace placeholder PWA icons with brand artwork
- [ ] Post-deploy Lighthouse run on real devices
