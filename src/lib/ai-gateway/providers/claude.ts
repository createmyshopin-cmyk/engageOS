import "server-only";

import { apiKeyForProvider, modelForProvider } from "@/lib/ai-gateway/config";
import type {
  CompletionRequest,
  CompletionResult,
  ModelProvider,
} from "@/lib/ai-gateway/types";

const TIMEOUT_MS = 30_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function createClaudeProvider(): ModelProvider {
  const id = "anthropic" as const;
  return {
    id,
    isConfigured: () => !!apiKeyForProvider(id),
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const apiKey = apiKeyForProvider(id);
      if (!apiKey) throw new Error("Anthropic API key is not configured");

      const model = modelForProvider(id);
      const system = request.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      const messages = request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        }));

      const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature ?? 0.2,
          system: system || undefined,
          messages,
        }),
      });

      const json = (await res.json()) as {
        error?: { message?: string };
        content?: { type: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      if (!res.ok) {
        throw new Error(json.error?.message ?? `Anthropic request failed (${res.status})`);
      }

      const text =
        json.content
          ?.filter((block) => block.type === "text")
          .map((block) => block.text ?? "")
          .join("")
          .trim() ?? "";
      if (!text) throw new Error("Anthropic returned an empty response");

      return {
        text,
        provider: id,
        model,
        usage: {
          inputTokens: json.usage?.input_tokens,
          outputTokens: json.usage?.output_tokens,
        },
      };
    },
  };
}
