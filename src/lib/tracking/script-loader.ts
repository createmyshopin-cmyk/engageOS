// Browser script-injection helpers with strict dedupe. Every provider loads
// its SDK through loadScriptOnce so a script can never be injected twice —
// not across re-renders, not across provider instances, not across multiple
// campaigns on the same page. The guard is a DOM id + a window registry.

interface TrackingRegistry {
  scripts: Set<string>;
  inited: Set<string>;
}

function registry(): TrackingRegistry {
  const w = window as unknown as { __engageosTracking?: TrackingRegistry };
  if (!w.__engageosTracking) {
    w.__engageosTracking = { scripts: new Set(), inited: new Set() };
  }
  return w.__engageosTracking;
}

/**
 * Inject an external <script> exactly once, keyed by `id`. Async + defer so
 * it never blocks the customer flow. Returns true if THIS call injected it,
 * false if it was already present (either from a prior call or server HTML).
 */
export function loadScriptOnce(id: string, src: string): boolean {
  if (typeof document === "undefined") return false;
  const reg = registry();
  if (reg.scripts.has(id) || document.getElementById(id)) return false;
  reg.scripts.add(id);
  const s = document.createElement("script");
  s.id = id;
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
  return true;
}

/**
 * Run `fn` at most once per `key` for the lifetime of the page. Used to guard
 * per-provider pixel initialisation (fbq('init'), gtag config, …) so re-mounts
 * or duplicate configs never double-initialise.
 */
export function initOnce(key: string, fn: () => void): void {
  if (typeof window === "undefined") return;
  const reg = registry();
  if (reg.inited.has(key)) return;
  reg.inited.add(key);
  try {
    fn();
  } catch (err) {
    console.error(`tracking init failed for ${key}:`, err);
  }
}

/** Ensure window.dataLayer exists and return it. */
export function dataLayer(): unknown[] {
  const w = window as unknown as { dataLayer?: unknown[] };
  if (!w.dataLayer) w.dataLayer = [];
  return w.dataLayer;
}
