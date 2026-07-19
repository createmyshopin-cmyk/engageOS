import "server-only";
import { adminClient } from "@/lib/db/rpc";

/**
 * Server-side rate limit via the SQL check_rate_limit RPC.
 * Returns true when the request is allowed, false when over limit.
 */
export async function checkRateLimit(key: string, max: number): Promise<boolean> {
  const { data, error } = await adminClient().rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
  });
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  return data === true;
}
