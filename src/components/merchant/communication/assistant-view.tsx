"use client";

import React, { useCallback, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { commFetch } from "./api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface BroadcastProposal {
  name: string;
  templateName?: string;
  templateLanguage: string;
  phones: string[];
  segment: string;
  audience: string;
  recipientCount: number;
  sample: { name: string | null; phone: string }[];
  proposalToken: string;
}

interface AssistantResponse {
  reply: string;
  action?: string | null;
  actionResult?: {
    summary: string;
    data?: Record<string, unknown>;
    proposal?: BroadcastProposal;
  };
}

const SUGGESTIONS = [
  "How many coupons were redeemed today?",
  "Show customers inactive for 60 days",
  "Who are my top VIP customers?",
  "What's my WhatsApp delivery funnel?",
] as const;

export function AssistantView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<BroadcastProposal | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      setProposal(null);
      setTemplateName("");
      const userMsg: ChatMessage = { role: "user", content: trimmed };
      const nextHistory = [...messages, userMsg];
      setMessages(nextHistory);
      setInput("");
      setLoading(true);
      scrollToBottom();

      try {
        const json = await commFetch<AssistantResponse>("/api/m/communication/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: messages,
          }),
        });

        setMessages([...nextHistory, { role: "assistant", content: json.reply }]);
        if (json.actionResult?.proposal && json.actionResult.proposal.recipientCount > 0) {
          setProposal(json.actionResult.proposal);
          setTemplateName(json.actionResult.proposal.templateName ?? "");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        setLoading(false);
        scrollToBottom();
      }
    },
    [loading, messages, scrollToBottom]
  );

  const confirmBroadcast = useCallback(async () => {
    if (!proposal || !templateName.trim()) return;
    setConfirming(true);
    setError(null);
    try {
      const json = await commFetch<{ reply: string }>("/api/m/communication/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmBroadcast: {
            proposalToken: proposal.proposalToken,
            templateName: templateName.trim(),
          },
        }),
      });
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply }]);
      setProposal(null);
      setTemplateName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to launch broadcast");
    } finally {
      setConfirming(false);
    }
  }, [proposal, templateName]);

  return (
    <div className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden min-h-[520px]">
      <div className="flex items-center gap-2 border-b border-[#E5E7EB] px-4 py-3 bg-[#FAFAFA]">
        <Sparkles className="size-4 text-violet-600" />
        <div>
          <h2 className="text-sm font-bold text-[#111827]">AI Assistant</h2>
          <p className="text-[11px] text-[#6B7280]">
            Ask about customers, analytics, and WhatsApp — actions run through EngageOS APIs only.
          </p>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[280px] max-h-[420px]">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[#6B7280]">
              Try a question below or type your own. Broadcasts require your confirmation before
              sending.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium text-[#374151] hover:bg-[#F3F4F6]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-[#111827] text-white"
                  : "bg-[#F3F4F6] text-[#111827]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-[#6B7280]">
            <Loader2 className="size-4 animate-spin" />
            Thinking…
          </div>
        )}
      </div>

      {proposal && proposal.recipientCount > 0 && (
        <div className="mx-4 mb-3 rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
          <p className="text-xs font-bold text-violet-900">
            Broadcast preview — {proposal.recipientCount} recipients ({proposal.audience})
          </p>
          {proposal.sample.length > 0 && (
            <ul className="text-[11px] text-violet-800 space-y-0.5">
              {proposal.sample.map((s) => (
                <li key={s.phone}>
                  {s.name ?? "Customer"} · {s.phone}
                </li>
              ))}
              {proposal.recipientCount > proposal.sample.length && (
                <li className="text-violet-600">…and {proposal.recipientCount - proposal.sample.length} more</li>
              )}
            </ul>
          )}
          <label className="block text-[11px] font-bold text-violet-900">
            WhatsApp template name (required to send)
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. seasonal_offer"
              className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-sm font-normal text-[#111827]"
            />
          </label>
          <button
            type="button"
            disabled={confirming || !templateName.trim()}
            onClick={confirmBroadcast}
            className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            {confirming ? "Launching…" : "Confirm & launch broadcast"}
          </button>
        </div>
      )}

      {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}

      <form
        className="flex gap-2 border-t border-[#E5E7EB] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about customers, redemptions, or broadcasts…"
          className="flex-1 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#111827]"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="inline-flex items-center justify-center rounded-xl bg-[#111827] px-3 py-2 text-white disabled:opacity-50"
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
