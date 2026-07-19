"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { commFetch } from "./api";

interface Conversation {
  id: string;
  status: string;
  contact: { id: string; name: string | null; phone: string };
  last_message_at: string | null;
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  text: string | null;
  status: string;
  created_at: string;
}

export function InboxView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await commFetch<{ items: Conversation[] }>(
        "/api/m/communication/conversations?limit=50"
      );
      setConversations(json.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversation: Conversation) => {
    setSelected(conversation);
    setError(null);
    try {
      const json = await commFetch<{ items: Message[] }>(
        `/api/m/communication/conversations/${conversation.id}/messages?limit=50`
      );
      setMessages((json.items ?? []).slice().reverse());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadConversations(), 0);
    return () => clearTimeout(t);
  }, [loadConversations]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await commFetch(`/api/m/communication/conversations/${selected.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selected.contact.phone,
          text: reply.trim(),
        }),
      });
      setReply("");
      await loadMessages(selected);
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[#6B7280] p-6">
        <Loader2 className="size-4 animate-spin" />
        Loading conversations…
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[480px]">
      <div className="lg:col-span-1 rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E5E7EB] text-xs font-bold text-[#6B7280] uppercase tracking-wide">
          Conversations
        </div>
        <div className="max-h-[520px] overflow-y-auto divide-y divide-[#F3F4F6]">
          {conversations.length === 0 ? (
            <p className="p-4 text-xs text-[#6B7280]">No conversations yet.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => loadMessages(c)}
                className={`w-full text-left px-4 py-3 hover:bg-[#F9FAFB] ${
                  selected?.id === c.id ? "bg-[#F3F4F6]" : ""
                }`}
              >
                <p className="text-sm font-bold text-[#111827] truncate">
                  {c.contact.name || c.contact.phone}
                </p>
                <p className="text-xs text-[#6B7280]">{c.contact.phone}</p>
                <p className="text-[10px] text-[#9CA3AF] mt-1 capitalize">{c.status}</p>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="lg:col-span-2 rounded-2xl border border-[#E5E7EB] bg-white flex flex-col min-h-[480px]">
        {selected ? (
          <>
            <div className="px-4 py-3 border-b border-[#E5E7EB]">
              <p className="text-sm font-bold text-[#111827]">
                {selected.contact.name || selected.contact.phone}
              </p>
              <p className="text-xs text-[#6B7280]">{selected.contact.phone}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.direction === "outbound"
                      ? "ml-auto bg-[#DCF8C6] text-[#111827]"
                      : "bg-[#F3F4F6] text-[#111827]"
                  }`}
                >
                  {m.text ?? <span className="italic text-[#6B7280]">[media]</span>}
                </div>
              ))}
            </div>
            <form onSubmit={sendReply} className="p-3 border-t border-[#E5E7EB] flex gap-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type a reply…"
                className="flex-1 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="rounded-xl bg-[#25D366] px-4 py-2 text-white disabled:opacity-50"
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-[#6B7280] p-6">
            Select a conversation to view messages
          </div>
        )}
        {error && (
          <p className="px-4 pb-3 text-xs text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
