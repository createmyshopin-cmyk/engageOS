import "server-only";

import type { AIProviderId, ModelProvider } from "@/lib/ai-gateway/types";
import { createClaudeProvider } from "@/lib/ai-gateway/providers/claude";
import { createGeminiProvider } from "@/lib/ai-gateway/providers/gemini";
import { createOpenAiProvider } from "@/lib/ai-gateway/providers/openai";

const providers: Record<AIProviderId, ModelProvider> = {
  openai: createOpenAiProvider(),
  anthropic: createClaudeProvider(),
  google: createGeminiProvider(),
};

export function getProvider(id: AIProviderId): ModelProvider {
  return providers[id];
}

export function listConfiguredProviders(): AIProviderId[] {
  return (Object.keys(providers) as AIProviderId[]).filter((id) =>
    providers[id].isConfigured()
  );
}
