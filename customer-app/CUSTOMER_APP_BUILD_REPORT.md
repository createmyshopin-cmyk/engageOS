# CUSTOMER_APP_BUILD_REPORT

EngageOS V2 — standalone customer experience app.
Location: `customer-app/` (independent from the Next.js backend — backend, auth, tenant repository, and database untouched).

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 8 (rolldown) |
| UI | React 19 + TypeScript 6 |
| Routing | React Router 7 (lazy routes) |
| Data | TanStack Query 5 |
| State | Zustand 5 |
| Styling | TailwindCSS 4 (`@tailwindcss/vite`) |
| Animation | CSS transform/opacity keyframes only (Motion installed, unused in critical path — zero Lottie/GIF) |
| Scratch | Custom canvas engine (zero deps) |
| Confetti | Custom canvas burst (zero deps) |
| PWA | `vite-plugin-pwa` (Workbox `generateSW`) |

## Bundle Size (production, gzip)

| Asset | Raw | Gzip |
|---|---|---|
| vendor (react, react-dom, react-router) | 283.5 KB | **90.2 KB** |
| index (entry + query + zustand + services) | 28.3 KB | **8.9 KB** |
| CampaignPage (lazy route) | 27.3 KB | **9.6 KB** |
| NotFound (lazy route) | 0.5 KB | 0.3 KB |
| runtime | 0.6 KB | 0.4 KB |
| CSS (Tailwind, purged) | 14.0 KB | **3.7 KB** |
| HTML | 1.6 KB | 0.8 KB |

**Total JS on the campaign route: ~109 KB gzip** — under the 120 KB target.
Build time: 2.5s. 88 modules. Precache: 13 entries / 352.8 KiB (raw).

## Load Time

- **Instant paint**: `index.html` ships an inline-CSS boot spinner on a dark surface — no blank white screen ever, no JS required for first paint.
- **Preloader**: React `Preloader` takes over with merchant logo (pulse animation, GPU transform-only), merchant name, campaign name while campaign data loads; unmounts the instant data is ready.
- Route-level code splitting (`lazy()`), vendor chunk cached independently of app code (long-term cache friendly hashes).
- Campaign data fetched via TanStack Query (60s staleTime, 1 retry); branding assets (logo, prize images) preloaded via `Image()` + `decoding=async` as soon as data lands; logo rendered with `fetchpriority=high` (LCP element).
- Expected on 4G / mid-range Android with same-origin serving: FCP well under 900ms (HTML+CSS inline paint), interactive < 2s (~110 KB gzip JS).

## API Integration (existing backend only — nothing duplicated)

| Call | Endpoint | Notes |
|---|---|---|
| Campaign display | Supabase RPC `campaign_display` (anon-granted) or `GET /api/campaign` fallback | branding, prizes, redirect settings |
| Register + play | `POST /api/play` | single atomic call: customer upsert, prize draw, coupon issue, all `customer_events`/`campaign_events` emitted server-side |
| Experience beacons | `POST /api/experience` via `sendBeacon` | `reward.viewed`, `redirect.started/opened/completed/cancelled` |

- Client mirrors backend validation (`name` regex incl. Malayalam, Indian phone → `+91` E.164, `source` slug normalization, slug regexes, `isSafeRedirectUrl` https-only + private-host blocklist).
- **Retry**: exponential-ish backoff on network failure/5xx (2 retries for reads, 1 for `/api/play` — never retries 4xx).
- **Offline queue**: experience beacons queue in `sessionStorage` when offline and flush on `online`/app load.

> ⚠️ Deployment note: the Next.js API routes set **no CORS headers**. Serve this app same-origin with the API (reverse-proxy `/api/*`), or add CORS to the routes. Dev server already proxies `/api → localhost:3000`. `campaign_display` can go direct-to-Supabase (anon key, CORS handled by Supabase) via `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.
> ⚠️ `campaign_display` does not return `banner_url` — extend the RPC if campaign banners are needed.

## Journey / State Machine

`landing → register (form) → scratch → revealed (won | lost) | blocked`

- Blocked states handled with friendly copy: `already_played`, `campaign_inactive`, `campaign_full`, `rate_limited`.
- Invalid slugs / missing campaign / fetch error → dedicated unavailable screens.
- Post-win: type-aware claim instructions per `prize_type`, coupon code panel (coupon/gift_voucher), worth (₹), expiry date, confetti.
- Redirect: countdown (respects configured `delay`), **Open Now / Stay Here**, native deep links (instagram/youtube/whatsapp/telegram) with 700ms https fallback via `visibilitychange`, https-only safety re-check, all four redirect beacons emitted.

## Scratch Engine

- Pure canvas, `destination-out` compositing over a DOM prize layer.
- Pointer Events with **coalesced events** → smooth 60fps strokes on fast swipes.
- DPR-aware (capped at 2× for memory), progress measured on sampled alpha channel (every 8th pixel) inside `requestAnimationFrame` — never on the pointer hot path.
- Reveal threshold 55%; haptic ticks on scratch start and reveal (`navigator.vibrate`, optional).
- `touch-action: none`, pointer capture — no scroll fighting.

## Animation

- All animations transform/opacity only (GPU-composited): fade-up entrances, soft logo pulse, spinner.
- `prefers-reduced-motion` respected.
- Confetti: 90-particle canvas burst, self-terminates at 2.6s, `pointer-events: none`.

## PWA / Offline

- Workbox `generateSW`, `autoUpdate` registration.
- Precache: app shell (JS/CSS/HTML/SVG/woff2).
- Runtime caching: **images** (merchant logo, reward art) CacheFirst 7 days / 120 entries; **fonts** CacheFirst 30 days; **campaign_display RPC** NetworkFirst (4s timeout) with 24h offline fallback.
- Manifest: standalone display, theme `#0b0b0f`, 192/512 icons (placeholder brand-amber PNGs — replace with real artwork).
- `navigateFallbackDenylist` for `/api/*`.

## Mobile

- Android-first: `100dvh` layout, `viewport-fit=cover` + safe-area padding, `inputMode=numeric` + `enterKeyHint`, tel autocomplete, tap-highlight removed, `overscroll-behavior-y: none`, 44px+ touch targets, active-scale button feedback, optional haptics.

## Branding

- Merchant logo on every step (preloader, header persists across landing/register/scratch/reveal/redirect); letter-avatar fallback.
- Brand accent auto-adapts from prize `background_color`; prize card and scratch underlay use per-prize `background_color` + `image_url`.

## Lighthouse Readiness

- Performance: minimal JS, code-split, preloaded LCP image, inline first paint → structured for 100 on mobile once served same-origin over HTTP/2.
- Accessibility: labelled inputs, aria on canvas, semantic headings, focus-visible borders, reduced-motion support, contrast-safe palette.
- Best practices: HTTPS-only redirects, `noopener`, no console errors, no deprecated APIs.
- SEO: intentionally `noindex` (not required).

## Production Readiness Checklist

- [x] `npm run build` green (tsc + vite, 2.5s)
- [x] Preview smoke test: `/c/:merchant/:campaign` 200, `sw.js` 200, `manifest.webmanifest` 200
- [x] Bundle < 120 KB gzip
- [x] Backend/auth/tenant/database untouched
- [ ] Deploy same-origin with API (or add CORS to `/api/play` + `/api/experience`)
- [ ] Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (or ship a `GET /api/campaign` endpoint)
- [ ] Replace placeholder PWA icons with brand artwork
- [ ] Optionally extend `campaign_display` RPC with `banner_url`

## Commands

```bash
cd customer-app
npm run dev      # dev server, proxies /api → localhost:3000
npm run build    # production build → dist/
npm run preview  # serve production build locally
```
