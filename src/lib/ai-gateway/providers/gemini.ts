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

export function createGeminiProvider(): ModelProvider {
  const id = "google" as const;
  return {
    id,
    isConfigured: () => !!apiKeyForProvider(id),
    async complete(request: CompletionRequest): Promise<CompletionResult> {
      const apiKey = apiKeyForProvider(id);
      if (!apiKey) throw new Error("Google AI API key is not configured");

      const model = modelForProvider(id);
      const system = request.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");

      const contents = request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents,
          generationConfig: {
            temperature: request.temperature ?? 0.2,
            maxOutputTokens: request.maxTokens ?? 1024,
            ...(request.jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });

      const json = (await res.json()) as {
        error?: { message?: string };
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
        };
      };

      if (!res.ok) {
        throw new Error(json.error?.message ?? `Gemini request failed (${res.status})`);
      }

      const text =
        json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim() ?? "";
      if (!text) throw new Error("Gemini returned an empty response");

      return {
        text,
        provider: id,
        model,
        usage: {
          inputTokens: json.usageMetadata?.promptTokenCount,
          outputTokens: json.usageMetadata?.candidatesTokenCount,
        },
      };
    },
  };
}
