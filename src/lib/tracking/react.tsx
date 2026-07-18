"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { TrackingEngine } from "./engine";
import type {
  TrackingConfig,
  TrackingContext as Ctx,
  TrackingEventName,
  TrackingPayload,
} from "./types";

interface TrackingApi {
  track: (event: TrackingEventName, payload?: TrackingPayload) => void;
  context: Ctx | null;
}

const TrackingReactContext = createContext<TrackingApi>({
  track: () => {},
  context: null,
});

/** Access the engine's track() from anywhere inside <TrackingBootstrap>. */
export function useTracking(): TrackingApi {
  return useContext(TrackingReactContext);
}

/** Coarse device class from the UA — used as an event dimension only. */
function detectDevice(): Ctx["deviceType"] {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}

interface BootstrapProps {
  configs: TrackingConfig[];
  context: Omit<Ctx, "deviceType">;
  children: ReactNode;
}

/**
 * Mounts the Tracking Engine for the customer app. Resolves device type in the
 * browser, initialises every enabled provider exactly once, fires the entry
 * events, and exposes track() to the play flow via context.
 *
 * The engine lives in a ref so it survives re-renders; init runs once.
 */
export function TrackingBootstrap({ configs, context, children }: BootstrapProps) {
  const engineRef = useRef<TrackingEngine | null>(null);
  if (engineRef.current === null) engineRef.current = new TrackingEngine();

  // Stable full context (adds deviceType). Recomputed only if inputs change.
  const fullContext = useMemo<Ctx>(
    () => ({ ...context, deviceType: detectDevice() }),
    [context],
  );

  useEffect(() => {
    const engine = engineRef.current!;
    if (configs.length === 0) return;
    engine.init(configs, fullContext);
    // Entry funnel events fire once on mount.
    engine.track("page_view");
    engine.track("landing_viewed");
    engine.track("qr_scan", { source: fullContext.trafficSource });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const api = useMemo<TrackingApi>(
    () => ({
      track: (event, payload) => engineRef.current?.track(event, payload),
      context: fullContext,
    }),
    [fullContext],
  );

  return (
    <TrackingReactContext.Provider value={api}>
      {children}
    </TrackingReactContext.Provider>
  );
}
