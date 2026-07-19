import "server-only";

import { resolveProviderChain } from "@/lib/ai-gateway/config";
import { getProvider } from "@/lib/ai-gateway/providers";
import type {
  AIPurpose,
  CompletionRequest,
  CompletionResult,
} from "@/lib/ai-gateway/types";

const MAX_ATTEMPTS_PER_PROVIDER = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : String(err);
  return (
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("timeout") ||
    message.includes("abort") ||
    message.includes("overloaded") ||
    message.includes("503")
  );
}

export class AIGateway {
  /** Resolve the provider chain for a given purpose (assistant, general, …). */
  static resolveProviders(purpose?: AIPurpose) {
    return resolveProviderChain(purpose);
  }

  /**
   * Complete a chat request with per-provider retries and cross-provider fallback.
   * Never imports vendor SDKs — all providers use fetch.
   */
  static async complete(request: CompletionRequest): Promise<CompletionResult> {
    const chain = resolveProviderChain(request.purpose);
    if (chain.length === 0) {
      throw new Error(
        "AI Gateway is not configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY."
      );
    }

    const errors: string[] = [];

    for (const providerId of chain) {
      const provider = getProvider(providerId);
      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
        try {
          const result = await provider.complete(request);
          if (process.env.NODE_ENV !== "test") {
            console.info("[ai-gateway] completion", {
              provider: result.provider,
              model: result.model,
              purpose: request.purpose ?? "general",
              usage: result.usage,
            });
          }
          return result;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${providerId}#${attempt}: ${msg}`);
          if (attempt < MAX_ATTEMPTS_PER_PROVIDER && isRetryable(err)) {
            await sleep(400 * attempt);
            continue;
          }
          break;
        }
      }
    }

    throw new Error(
      `All AI providers failed: ${errors.slice(-3).join("; ") || "unknown error"}`
    );
  }
}
