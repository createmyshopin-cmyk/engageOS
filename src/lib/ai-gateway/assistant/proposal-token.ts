import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 30 * 60 * 1000;

export interface BroadcastProposalPayload {
  businessId: string;
  name: string;
  templateLanguage: string;
  phones: string[];
  segment: string;
  audience: string;
  exp: number;
}

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.ENGAGEOS_WACRM_SSO_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET is required for assistant broadcast proposals");
  }
  return s;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export function mintBroadcastProposalToken(input: {
  businessId: string;
  name: string;
  templateLanguage: string;
  phones: string[];
  segment: string;
  audience: string;
}): string {
  const payload: BroadcastProposalPayload = {
    ...input,
    phones: [...new Set(input.phones)],
    exp: Date.now() + TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyBroadcastProposalToken(
  token: string,
  businessId: string
): BroadcastProposalPayload {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) throw new Error("Invalid proposal token");

  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid proposal signature");
  }

  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString("utf8")
  ) as BroadcastProposalPayload;

  if (payload.businessId !== businessId) {
    throw new Error("Proposal does not belong to this business");
  }
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error("Proposal has expired — ask the assistant again");
  }
  if (!payload.phones?.length) {
    throw new Error("Proposal has no recipients");
  }

  return payload;
}
