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

export function createOpenAiProvider(): ModelProvider {
  const id = "openai" as const;
  return {
    id,
    isConfigured: () => !!apiKeyForProvider(id),
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const apiKey = apiKeyForProvider(id);
      if (!apiKey) throw new Error("OpenAI API key is not configured");

      const model = modelForProvider(id);
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 1024,
          ...(request.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      const json = (await res.json()) as {
        error?: { message?: string };
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      if (!res.ok) {
        throw new Error(json.error?.message ?? `OpenAI request failed (${res.status})`);
      }

      const text = json.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) throw new Error("OpenAI returned an empty response");

      return {
        text,
        provider: id,
        model,
        usage: {
          inputTokens: json.usage?.prompt_tokens,
          outputTokens: json.usage?.completion_tokens,
        },
      };
    },
  };
}
