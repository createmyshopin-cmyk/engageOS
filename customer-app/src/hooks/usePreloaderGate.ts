import { useEffect, useRef, useState } from "react";

/**
 * Preloader gate: visible for a minimum of `minMs` (merchant-configured,
 * 300/600/1000 — no flash), fades out as soon as data is ready. When the
 * merchant disables the preloader, it drops out the moment data arrives.
 * Returns the current phase: "visible" | "leaving" | "gone".
 */
export function usePreloaderGate(ready: boolean, minMs = 300, enabled = true) {
  const [phase, setPhase] = useState<"visible" | "leaving" | "gone">(
    "visible",
  );
  const shownAt = useRef(performance.now());

  useEffect(() => {
    if (!ready || phase !== "visible") return;
    if (!enabled) {
      setPhase("gone");
      return;
    }
    const elapsed = performance.now() - shownAt.current;
    const wait = Math.max(0, minMs - elapsed);
    const t1 = setTimeout(() => setPhase("leaving"), wait);
    return () => clearTimeout(t1);
  }, [ready, phase, minMs, enabled]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(() => setPhase("gone"), 180);
    return () => clearTimeout(t);
  }, [phase]);

  return phase;
}
