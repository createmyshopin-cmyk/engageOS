/**
 * One-off smoke script: authenticated communication API checks.
 * Usage: node scripts/smoke-communication-api.mjs
 */
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq);
      const val = trimmed.slice(eq + 1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.SESSION_SECRET;

if (!url || !key || !secret) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SESSION_SECRET");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

function signCookie(token) {
  const sig = createHmac("sha256", secret).update(token).digest("base64url");
  return `${token}.${sig}`;
}

async function main() {
  const results = [];

  const { data: merchant, error: merchantErr } = await supabase
    .from("merchants")
    .select("id, business_id, name, email, role, status")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (merchantErr || !merchant) {
    console.error("No active merchant found:", merchantErr?.message);
    process.exit(1);
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  const { error: sessErr } = await supabase.from("merchant_sessions").insert({
    merchant_id: merchant.id,
    session_token: token,
    expires_at: expiresAt,
  });
  if (sessErr) {
    console.error("Failed to create session:", sessErr.message);
    process.exit(1);
  }

  const cookie = `merchant_session=${signCookie(token)}`;

  async function hit(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Cookie: cookie,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* ignore */
    }
    return { path, status: res.status, json };
  }

  const checks = [
    ["GET", "/api/m/communication/status"],
    ["GET", "/api/m/integrations/wacrm"],
    ["GET", "/api/m/communication/rules"],
    ["GET", "/api/m/communication/analytics"],
    ["GET", "/api/m/communication/broadcasts"],
    ["GET", "/api/m/communication/conversations"],
  ];

  for (const [method, path] of checks) {
    const r = await hit(method, path);
    results.push(r);
    const ok = r.status < 500 || r.status === 409;
    console.log(`${ok ? "PASS" : "FAIL"} ${method} ${path} -> ${r.status}`, r.json?.error ?? "");
  }

  const assistant = await hit("POST", "/api/m/communication/assistant", {
    message: "How many coupons redeemed today?",
  });
  const assistantExpected = assistant.status === 200 || assistant.status === 503;
  console.log(
    `${assistantExpected ? "PASS" : "FAIL"} POST /api/m/communication/assistant -> ${assistant.status}`,
    assistant.json?.error ?? assistant.json?.reply?.slice(0, 60) ?? ""
  );

  // DB: business_integrations readable
  const { error: biErr } = await supabase.from("business_integrations").select("id").limit(1);
  console.log(`${biErr ? "FAIL" : "PASS"} DB business_integrations query`, biErr?.message ?? "ok");

  // DB: priority column
  const { data: prioCol } = await supabase.rpc("communication_enqueue_job", {
    p_business_id: merchant.business_id,
    p_event_type: "smoke.script",
    p_payload: {},
    p_dedup_key: `smoke:script:${Date.now()}`,
    p_run_at: new Date().toISOString(),
    p_priority: 88,
  });
  const jobId = prioCol;
  let claimOk = false;
  if (jobId) {
    const { data: job, error: claimErr } = await supabase.rpc("communication_claim_next_job");
    if (claimErr) {
      console.log("FAIL DB priority claim rpc", claimErr.message);
    } else {
      claimOk = job?.id === jobId && job?.priority === 88;
      if (job?.id) {
        await supabase.rpc("communication_finish_job", {
          p_job_id: job.id,
          p_success: true,
          p_error: null,
        });
      }
    }
  }
  console.log(`${claimOk ? "PASS" : "FAIL"} DB priority enqueue/claim`, claimOk ? "ok" : "mismatch");

  await supabase.from("merchant_sessions").delete().eq("session_token", token);

  const apiFailures = results.filter((r) => r.status >= 500);
  const failed =
    apiFailures.length + (biErr ? 1 : 0) + (claimOk ? 0 : 1) + (assistantExpected ? 0 : 1);
  if (apiFailures.length) {
    for (const f of apiFailures) {
      console.log(`  API 5xx: ${f.path} -> ${f.status}`);
    }
  }
  console.log(`\nSmoke complete: ${failed === 0 ? "ALL PASSED" : `${failed} failure(s)`}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
