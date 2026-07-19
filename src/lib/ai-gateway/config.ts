import "server-only";

import type { AIProviderId, AIPurpose } from "@/lib/ai-gateway/types";

const PROVIDER_IDS: AIProviderId[] = ["openai", "anthropic", "google"];

function parseProvider(value: string | undefined): AIProviderId | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "claude") return "anthropic";
  if (normalized === "gemini") return "google";
  return PROVIDER_IDS.includes(normalized as AIProviderId)
    ? (normalized as AIProviderId)
    : null;
}

export function isAiGatewayEnabled(): boolean {
  if (process.env.AI_GATEWAY_ENABLED === "false") return false;
  return (
    !!process.env.OPENAI_API_KEY ||
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.GOOGLE_AI_API_KEY
  );
}

export function resolveDefaultProvider(): AIProviderId | null {
  const explicit =
    parseProvider(process.env.AI_GATEWAY_PROVIDER) ??
    parseProvider(process.env.AI_GATEWAY_DEFAULT_PROVIDER);
  if (explicit) return explicit;

  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GOOGLE_AI_API_KEY) return "google";
  return null;
}

/** Ordered fallback chain — primary first, then other configured providers. */
export function resolveProviderChain(purpose?: AIPurpose): AIProviderId[] {
  const primary = resolveDefaultProvider();
  const purposeOverride =
    purpose === "assistant"
      ? parseProvider(process.env.AI_GATEWAY_ASSISTANT_PROVIDER)
      : null;

  const head = purposeOverride ?? primary;
  const chain: AIProviderId[] = [];
  if (head) chain.push(head);

  for (const id of PROVIDER_IDS) {
    if (!chain.includes(id) && isProviderConfigured(id)) {
      chain.push(id);
    }
  }
  return chain;
}

export function isProviderConfigured(id: AIProviderId): boolean {
  switch (id) {
    case "openai":
      return !!process.env.OPENAI_API_KEY;
    case "anthropic":
      return !!process.env.ANTHROPIC_API_KEY;
    case "google":
      return !!process.env.GOOGLE_AI_API_KEY;
    default:
      return false;
  }
}

export function modelForProvider(id: AIProviderId): string {
  switch (id) {
    case "openai":
      return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    case "anthropic":
      return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-20250514";
    case "google":
      return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
    default:
      return "unknown";
  }
}

export function apiKeyForProvider(id: AIProviderId): string | null {
  switch (id) {
    case "openai":
      return process.env.OPENAI_API_KEY?.trim() || null;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY?.trim() || null;
    case "google":
      return process.env.GOOGLE_AI_API_KEY?.trim() || null;
    default:
      return null;
  }
}
