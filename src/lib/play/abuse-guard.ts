import "server-only";

export type PlayGuardResult = "ok" | "rate_limited";

/**
 * Play abuse limits (5s cooldown + 24h volume) are enforced in play_campaign RPC.
 * Keeping this hook so the API route can add app-layer checks later without churn.
 */
export async function guardPlayRequest(_opts: {
  ip: string;
  merchantSlug: string;
  campaignSlug: string;
  deviceId?: string | null;
}): Promise<PlayGuardResult> {
  return "ok";
}

/** Page views are not play attempts — always allow render. */
export async function guardPlayPageView(_ip: string): Promise<boolean> {
  return true;
}
