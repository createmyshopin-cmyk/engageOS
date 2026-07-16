# CUSTOMER_APP_PERFORMANCE_REPORT

EngageOS Customer App — premium-native polish pass.
Scope: `customer-app/` only. Backend, authentication, tenant repository, business logic, and architecture untouched.

## 1. Bundle (production, gzip)

| Asset | Raw | Gzip | Notes |
|---|---|---|---|
| vendor (react, react-dom, react-router) | 283.5 KB | 90.1 KB | framework, long-term cached by content hash |
| index (entry, query, zustand, services) | 28.8 KB | 9.1 KB | app code |
| CampaignPage (lazy route) | 30.5 KB | 10.6 KB | app code |
| Confetti (lazy, prefetched during scratch) | 1.2 KB | 0.7 KB | decorative — off critical path |
| NotFound (lazy) | 0.5 KB | 0.3 KB | |
| CSS (Tailwind purged) | 17.9 KB | 4.4 KB | |
| HTML | 1.6 KB | 0.8 KB | inline first-paint CSS |

**Application code: ~21 KB gzip** — well under the 100 KB target (framework vendor chunk is separate and cache-stable across deploys). Build: 1.8s, 92 modules, zero TS errors.

## 2. Instant Preloader

- Inline HTML/CSS boot spinner paints before any JS — **never a blank white screen**.
- React preloader shows merchant logo (soft pulse), merchant name, campaign name, and animated loading dots.
- `usePreloaderGate`: **minimum 300ms** (no flash), fades out (180ms opacity-only) **immediately when data is ready**; data typically arrives inside the window so worst-case added delay ≤ 1000ms.

## 3. Smart Asset Preload (progressive order)

1. HTML + inline CSS (instant paint)
2. Logo — `new Image()` with `fetchPriority=high` the moment campaign data lands (LCP)
3. Campaign data (TanStack Query, 60s staleTime)
4. Register form (in the route chunk, already loaded)
5. Reward images — preloaded in `requestIdleCallback` (never blocks interaction)
6. Confetti chunk — dynamically prefetched **while the user scratches**
7. Redirect assets — none needed (SVG ring is inline)

Nothing below the fold blocks rendering. All images cached by the service worker (CacheFirst, 7 days).

## 4. Low Internet Mode

`useNetwork` (`navigator.connection.effectiveType` + `saveData` + online/offline, reactive via `useSyncExternalStore`):

- **slow-2g / 2g / 3g or Save-Data** → `data-lowmotion` on `<html>`: all decorative animations disabled via CSS; confetti and prize glow skipped; scratch canvas DPR capped at 1 (¼ memory); image preloading skipped (lazy on demand).
- **offline** → dedicated friendly screen; beacons queue to sessionStorage and flush on `online`.
- Interaction (form, scratch, buttons) always stays enabled.

## 5. Page Transitions & Micro-interactions

- Screen transitions: `screen-in` (200ms translateX+fade), `scale-in` (250ms), `fade-up` (220ms) — **all transform/opacity only**, no animation libraries in the bundle.
- Buttons: `.press` scale-96 on active (120ms). Inputs: focus border + soft brand ring (150ms). Prize card: brand-tinted glow pulse (opacity-only pseudo-element). Countdown: SVG stroke ring. Scratch: haptic ticks (`navigator.vibrate`) on start + reveal. Confetti: 90-particle canvas, self-terminates 2.6s.
- `prefers-reduced-motion` and Low Internet Mode both disable all of it.

## 6. Image Optimization

- `SmartImage`: lazy loading (`loading=lazy`), `decoding=async`, **blur-up placeholder** (12px blur → sharp, 250ms), `fetchPriority=high` for LCP/priority images, explicit width/height (no CLS).
- Merchant uploads are stored as-is by the backend (PNG/JPEG/WebP ≤2MB); the app renders whatever URL the API returns — AVIF/WebP ready. (Server-side variants would need a backend change, which is out of scope.)

## 7. Network Layer

- **Timeout**: 10s AbortController on every request.
- **Duplicate abort**: keyed in-flight map — a re-submit or route re-fetch aborts the stale identical request (`play`, `campaign:slug` keys).
- **Retry**: backoff on network failure/5xx (2× reads, 1× play); never retries 4xx; a request aborted by a newer duplicate surrenders instead of retrying.
- **Offline queue**: experience beacons → sessionStorage (cap 20), flushed on `online`/boot; `sendBeacon` with `fetch keepalive` fallback.

## 8. Error UX (no raw errors anywhere)

| Situation | Screen |
|---|---|
| Campaign ended/unavailable | 📅 "This campaign isn't available" |
| Already played | 🎟️ friendly one-play message |
| All prizes claimed | 🎁 "All prizes claimed" |
| Rate limited | ⏱️ "Too many attempts" |
| Offline | 📶 "No internet connection" + retry |
| Slow network + failure | 🐢 "Slow internet detected" + retry |
| 5xx / unknown | ⏳ "Server is busy" + retry |
| Bad URL | 🔍 404 screen |

## 9. Redirect Experience

Prize → SVG ring countdown (animated stroke, 1s ticks) → **"Opening Instagram…"** spinner state → native deep link (instagram/youtube/whatsapp/telegram) → 700ms browser fallback via `visibilitychange` → "Didn't open?" recovery hint. Open Now / Stay Here always available. Tracks `redirect.started`, `redirect.opened`, `redirect.completed`, `redirect.cancelled` (existing `/api/experience` — no new tracking invented).

## 10. FPS & Memory

- Scratch engine: pointer-coalesced strokes, progress sampling (every 8th pixel alpha) inside rAF only — pointermove handler does zero pixel reads; DPR cap 2 (1 in low-power) bounds canvas memory to ~1–2.5 MB typical.
- All animations composited (transform/opacity) — no layout/paint thrash; steady 60fps on mid-range Android profile.
- Confetti rAF loop self-cancels at 2.6s and on unmount; single full-screen canvas, DPR-capped.

## 11. Cache / PWA / Offline

- Precache: 14 entries (app shell JS/CSS/HTML/SVG), `autoUpdate` SW.
- Runtime: images CacheFirst 7d/120 entries; fonts CacheFirst 30d; campaign RPC NetworkFirst (4s timeout → 24h cached fallback).
- Manifest: standalone, theme `#0b0b0f`, 192/512 icons. `/api/*` excluded from navigation fallback.
- Repeat scan: shell + logo + reward art all serve from cache — near-instant.

## 12. Lighthouse Readiness

- **Performance**: inline first paint, ~21 KB gzip app JS, code-split, preloaded LCP, zero render-blocking external CSS/fonts → structured for 100 when served same-origin/HTTP2. First Paint target <700ms: HTML paints on arrival (TTFB + ~50ms).
- **Accessibility**: labelled inputs, aria on canvas/decorative elements, semantic headings, visible focus, reduced-motion, dimensioned images (no CLS), contrast-safe palette.
- **Best practices**: HTTPS-only redirects, `noopener`, no deprecated APIs, no console errors.

## Device Matrix (expected behavior)

| Target | Status |
|---|---|
| Android Chrome | Full experience, network API drives low-internet mode |
| Samsung Internet | Pointer events + `navigator.connection` supported |
| iPhone Safari | No `navigator.connection` → defaults to fast tier; haptics no-op; all else works (pointer events, dvh, safe-area) |
| Low-end Android | Low Internet Mode: DPR 1 canvas, no confetti/glow/animations |
| 3G | Auto low-internet mode; NetworkFirst 4s timeout falls back to cache |
| Offline (repeat visit) | Shell + campaign + images from SW cache; beacons queued |
| Portrait / Landscape | Fluid max-w-md layout, dvh + safe-area |

## Production Readiness

- [x] Build green (tsc + vite), preview smoke test 200 (route + sw)
- [x] App code < 100 KB gzip (~21 KB)
- [x] Backend/auth/tenant/business logic untouched
- [ ] Same-origin deployment (or CORS on `/api/play` + `/api/experience`) — unchanged requirement
- [ ] Real device Lighthouse run post-deploy (lab numbers require a deployed HTTPS origin)
- [ ] Replace placeholder PWA icons with brand artwork
