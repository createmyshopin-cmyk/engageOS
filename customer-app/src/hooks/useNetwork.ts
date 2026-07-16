import { useSyncExternalStore } from "react";

export type NetworkTier = "fast" | "slow" | "offline";

interface NetworkInfo {
  tier: NetworkTier;
  saveData: boolean;
}

type NetworkConnection = {
  effectiveType?: string;
  saveData?: boolean;
  addEventListener?: (type: "change", cb: () => void) => void;
  removeEventListener?: (type: "change", cb: () => void) => void;
};

function getConnection(): NetworkConnection | undefined {
  return (navigator as Navigator & { connection?: NetworkConnection })
    .connection;
}

function computeInfo(): NetworkInfo {
  if (!navigator.onLine) return { tier: "offline", saveData: false };
  const conn = getConnection();
  const saveData = conn?.saveData ?? false;
  const et = conn?.effectiveType;
  // slow-2g / 2g / 3g → low internet mode
  const tier: NetworkTier =
    et === "slow-2g" || et === "2g" || et === "3g" ? "slow" : "fast";
  return { tier, saveData: saveData || tier === "slow" };
}

let cached = computeInfo();

function subscribe(cb: () => void) {
  const update = () => {
    cached = computeInfo();
    cb();
  };
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  const conn = getConnection();
  conn?.addEventListener?.("change", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
    conn?.removeEventListener?.("change", update);
  };
}

/** Reactive network status — drives Low Internet Mode. */
export function useNetwork(): NetworkInfo {
  return useSyncExternalStore(
    subscribe,
    () => cached,
    () => cached,
  );
}

/** Non-reactive snapshot for use outside React. */
export function networkSnapshot(): NetworkInfo {
  return computeInfo();
}
