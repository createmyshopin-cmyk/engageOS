import "server-only";

import type { TenantRepository } from "@/lib/db/tenant-repository";
import { AIGateway } from "@/lib/ai-gateway/gateway";
import type { ChatMessage } from "@/lib/ai-gateway/types";
import {
  executeAssistantAction,
} from "@/lib/ai-gateway/assistant/actions";
import { buildAssistantSystemPrompt } from "@/lib/ai-gateway/assistant/prompt";
import {
  assistantPlanSchema,
  type AssistantActionResult,
} from "@/lib/ai-gateway/assistant/schema";

export interface AssistantHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RunAssistantInput {
  message: string;
  history?: AssistantHistoryMessage[];
}

export interface RunAssistantResult {
  reply: string;
  action?: string | null;
  actionResult?: AssistantActionResult;
  provider?: string;
  model?: string;
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Assistant did not return valid JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function buildMessages(
  history: AssistantHistoryMessage[],
  message: string
): ChatMessage[] {
  const system: ChatMessage = {
    role: "system",
    content: buildAssistantSystemPrompt(),
  };
  const prior: ChatMessage[] = history.slice(-8).map((m) => ({
    role: m.role,
    content: m.content,
  }));
  return [system, ...prior, { role: "user", content: message }];
}

function mergeReply(planReply: string, actionResult?: AssistantActionResult): string {
  if (!actionResult) return planReply;
  if (actionResult.proposal?.recipientCount === 0) {
    return actionResult.summary;
  }
  return `${planReply}\n\n${actionResult.summary}`.trim();
}

export async function runMerchantAssistant(
  repo: TenantRepository,
  input: RunAssistantInput
): Promise<RunAssistantResult> {
  const completion = await AIGateway.complete({
    purpose: "assistant",
    jsonMode: true,
    temperature: 0.1,
    messages: buildMessages(input.history ?? [], input.message),
  });

  const raw = extractJsonObject(completion.text);
  const plan = assistantPlanSchema.parse(raw);

  let actionResult: AssistantActionResult | undefined;
  if (plan.action) {
    actionResult = await executeAssistantAction(repo, plan.action, plan.params ?? {});
  }

  return {
    reply: mergeReply(plan.reply, actionResult),
    action: plan.action,
    actionResult,
    provider: completion.provider,
    model: completion.model,
  };
}
