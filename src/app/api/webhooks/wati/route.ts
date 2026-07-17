import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { resolveWatiTenant, processWatiWebhook } from "@/lib/wati/webhook";

/**
 * Inbound WATI webhook — POST /api/webhooks/wati?token=<per-tenant-secret>
 *
 * WATI has NO native HMAC signature (unlike Meta), so the endpoint is
 * secured by a high-entropy per-tenant bearer token carried in the URL,
 * which ALSO resolves the payload to exactly one business (tenant
 * isolation). See src/lib/wati/webhook.ts for the processing contract.
 *
 * ADDITIVE ONLY: this route never sends a message and never touches the
 * outbound flow (sync.ts). It records delivery receipts and inbound
 * replies onto rows the outbound flow already owns.
 *
 * Flow: validate token → resolve tenant → 200 ACK immediately →
 * process asynchronously via after() (keeps the fn warm on serverless).
 */

export const runtime = "nodejs";
// after() runs within this route's max duration; give the async
// coupon/receipt writes headroom beyond the platform default.
export const maxDuration = 60;

/** Accept the token from the query string (primary) or a bearer header. */
function readToken(request: NextRequest): string | null {
  const q = request.nextUrl.searchParams.get("token")
    ?? request.nextUrl.searchParams.get("secret");
  if (q && q.trim()) return q.trim();
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  return null;
}

/**
 * GET: lightweight health/verification probe. WATI's "Trigger sample
 * callback" and manual setup checks hit the URL; a valid token returns
 * 200 so the merchant can confirm wiring. Never leaks tenant details.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = readToken(request);
  const integration = await resolveWatiTenant(token);
  if (!integration) {
    return NextResponse.json({ ok: false, error: "invalid token" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, status: "ready" }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = readToken(request);

  // Invalid verification → reject. Never reveal whether a token was close.
  const integration = await resolveWatiTenant(token);
  if (!integration) {
    console.warn("[wati-webhook] rejected: invalid or unknown token");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Parse defensively — a malformed body is still ACKed 200 (so WATI does
  // not enter its 24h retry storm over a payload we can never process).
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    console.warn("[wati-webhook] received unparseable body — acknowledged");
    return NextResponse.json({ ok: true, status: "ignored" }, { status: 200 });
  }

  console.info("[wati-webhook] received + verified");

  // Fast ACK; heavy work (idempotency claim, coupon receipt, event log)
  // happens after the response is flushed.
  after(async () => {
    await processWatiWebhook(integration, body);
  });

  return NextResponse.json({ ok: true, status: "received" }, { status: 200 });
}
