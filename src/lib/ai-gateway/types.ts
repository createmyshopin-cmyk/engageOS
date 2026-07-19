export type AIPurpose = "assistant" | "general";

export type AIProviderId = "openai" | "anthropic" | "google";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  purpose?: AIPurpose;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface CompletionResult {
  text: string;
  provider: AIProviderId;
  model: string;
  usage?: TokenUsage;
}

export interface ModelProvider {
  id: AIProviderId;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  isConfigured(): boolean;
}
