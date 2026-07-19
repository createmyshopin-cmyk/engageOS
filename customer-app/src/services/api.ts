import type {
  CampaignDisplay,
  ExperienceEventType,
  PlayApiResponse,
  PlayRequest,
} from "../types";
import { getOrCreateDeviceId } from "../lib/device-id";

/**
 * Base URL for the EngageOS Next.js API. Empty string = same origin
 * (production setup: this app is reverse-proxied alongside the API).
 */
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

/**
 * Supabase project — only used for the `campaign_display` RPC, which is the
 * single RPC granted to the anon role. Everything else goes through /api.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

const REQUEST_TIMEOUT_MS = 10_000;

/** In-flight dedupe: same key aborts the previous identical request. */
const inflight = new Map<string, AbortController>();

async function fetchWithRetry(
  input: string,
  init: RequestInit,
  retries = 2,
  dedupeKey?: string,
): Promise<Response> {
  if (dedupeKey) {
    inflight.get(dedupeKey)?.abort();
  }
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    if (dedupeKey) inflight.set(dedupeKey, controller);
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(input, { ...init, signal: controller.signal });
      // retry transient server errors, never 4xx
      if (res.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
      // a newer duplicate aborted us — surrender, don't retry
      if (
        error instanceof DOMException &&
        error.name === "AbortError" &&
        dedupeKey &&
        inflight.get(dedupeKey) !== controller
      ) {
        throw error;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    } finally {
      clearTimeout(timeout);
      if (dedupeKey && inflight.get(dedupeKey) === controller) {
        inflight.delete(dedupeKey);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Network error");
}

/** Fetch public campaign display data (branding, prizes, redirect settings). */
export async function getCampaignDisplay(
  merchantSlug: string,
  campaignSlug: string,
): Promise<CampaignDisplay | null> {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const res = await fetchWithRetry(
      `${SUPABASE_URL}/rest/v1/rpc/campaign_display`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          p_merchant_slug: merchantSlug,
          p_slug: campaignSlug,
        }),
      },
      2,
      `campaign:${merchantSlug}/${campaignSlug}`,
    );
    if (!res.ok) throw new Error(`campaign_display failed (${res.status})`);
    const data = (await res.json()) as CampaignDisplay | null;
    return data ?? null;
  }

  // Fallback: same-origin JSON endpoint if one exists / is proxied
  const res = await fetchWithRetry(
    `${API_BASE}/api/campaign?merchant=${encodeURIComponent(merchantSlug)}&campaign=${encodeURIComponent(campaignSlug)}`,
    { method: "GET" },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`campaign fetch failed (${res.status})`);
  const body = (await res.json()) as { ok: boolean; display?: CampaignDisplay };
  return body.display ?? null;
}

/** Register the customer and play the campaign — one atomic call. */
export async function play(request: PlayRequest): Promise<PlayApiResponse> {
  const res = await fetchWithRetry(
    `${API_BASE}/api/play`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    },
    1, // play mutates state — retry only once, on network failure / 5xx
    "play", // abort a stale duplicate submit
  );
  return (await res.json()) as PlayApiResponse;
}

interface QueuedBeacon {
  campaignId: string;
  eventType: ExperienceEventType;
  metadata?: Record<string, unknown>;
  deviceId?: string;
}

const QUEUE_KEY = "engageos.beacon_queue";

function readQueue(): QueuedBeacon[] {
  try {
    return JSON.parse(sessionStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedBeacon[]) {
  try {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-20)));
  } catch {
    /* storage full / unavailable — drop */
  }
}

function sendBeaconNow(payload: QueuedBeacon): boolean {
  const url = `${API_BASE}/api/experience`;
  const body = JSON.stringify(payload);
  if (typeof navigator.sendBeacon === "function") {
    try {
      return navigator.sendBeacon(
        url,
        new Blob([body], { type: "application/json" }),
      );
    } catch {
      /* fall through to fetch */
    }
  }
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => queueBeacon(payload));
  return true;
}

function queueBeacon(payload: QueuedBeacon) {
  writeQueue([...readQueue(), payload]);
}

/** Best-effort experience/redirect beacon with an offline queue. */
export function trackExperience(
  campaignId: string,
  eventType: ExperienceEventType,
  metadata?: Record<string, unknown>,
) {
  const payload: QueuedBeacon = {
    campaignId,
    eventType,
    metadata,
    deviceId: getOrCreateDeviceId(),
  };
  if (!navigator.onLine) {
    queueBeacon(payload);
    return;
  }
  sendBeaconNow(payload);
}

/** Flush any beacons queued while offline. Called on load + `online` event. */
export function flushBeaconQueue() {
  const queue = readQueue();
  if (queue.length === 0 || !navigator.onLine) return;
  writeQueue([]);
  for (const item of queue) sendBeaconNow(item);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", flushBeaconQueue);
}
