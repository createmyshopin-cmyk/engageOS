"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, Loader2, RefreshCw, Send } from "lucide-react";
import { fetchAdapter } from "./api";

interface Conversation {
  id: string;
  status: "open" | "pending" | "closed";
  contact: { id: string; phone: string; name: string | null } | null;
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  content_type?: string | null;
  content_text?: string | null;
  created_at: string;
}

/** Inbox tab — two-pane conversation view, read live from wacrm. */
export function InboxTab() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async (status: string) => {
    setError(null);
    setConversations(null);
    try {
      const json = await fetchAdapter(
        `/api/m/whatsapp/conversations?status=${encodeURIComponent(status)}`
      );
      if (!json.ok) throw new Error(json.error);
      setConversations(json.conversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inbox");
      setConversations([]);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessages(null);
    try {
      const json = await fetchAdapter(
        `/api/m/whatsapp/conversations/${conversationId}/messages`
      );
      if (json.ok) {
        // wacrm returns newest first — reverse to chat order.
        setMessages([...json.messages].reverse());
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        });
      }
    } catch {
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      loadConversations(statusFilter);
    }, 0);
    return () => clearTimeout(t);
  }, [statusFilter, loadConversations]);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const json = await fetchAdapter(`/api/m/whatsapp/conversations/${selected.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply.trim() }),
      });
      if (json.ok) {
        setReply("");
        await loadMessages(selected.id);
      } else {
        setError(json.error ?? "Failed to send");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-xs font-bold text-[#B91C1C]">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          <div className="flex items-center gap-1 border-b border-[#E5E7EB] p-2">
            {["open", "pending", "closed"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  statusFilter === s
                    ? "bg-[#16A34A] text-white"
                    : "text-[#6B7280] hover:bg-[#F8FAFC]"
                }`}
              >
                {s}
              </button>
            ))}
            <button
              onClick={() => loadConversations(statusFilter)}
              className="rounded-lg p-1.5 text-[#6B7280] hover:bg-[#F8FAFC]"
              aria-label="Refresh"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {conversations === null ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs font-bold text-[#6B7280]">
                <Loader2 className="size-4 animate-spin text-[#16A34A]" /> Loading…
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs font-bold text-[#6B7280]">
                No {statusFilter} conversations.
              </p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelected(c);
                    loadMessages(c.id);
                  }}
                  className={`block w-full border-b border-[#F3F4F6] px-4 py-3 text-left transition-colors last:border-0 ${
                    selected?.id === c.id ? "bg-[#F0FDF4]" : "hover:bg-[#F8FAFC]"
                  }`}
                >
                  <p className="text-xs font-bold text-[#111827]">
                    {c.contact?.name || c.contact?.phone || "Unknown"}
                  </p>
                  {c.contact?.name && (
                    <p className="text-[10px] font-medium text-[#9CA3AF]">{c.contact.phone}</p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread */}
        <div className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[#9CA3AF]">
              <Inbox className="size-8" />
              <p className="text-xs font-bold">Select a conversation</p>
            </div>
          ) : (
            <>
              <div className="border-b border-[#E5E7EB] px-5 py-3">
                <p className="text-xs font-black text-[#111827]">
                  {selected.contact?.name || selected.contact?.phone}
                </p>
                <p className="text-[10px] font-medium text-[#9CA3AF]">
                  Conversation handled in wacrm — replies here send through your workspace.
                </p>
              </div>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-[#F8FAFC] p-4">
                {messages === null ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-xs font-bold text-[#6B7280]">
                    <Loader2 className="size-4 animate-spin text-[#16A34A]" /> Loading messages…
                  </div>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-xs font-bold text-[#6B7280]">
                    No messages in this conversation.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-xs font-medium ${
                          m.direction === "outbound"
                            ? "rounded-br-md bg-[#16A34A] text-white"
                            : "rounded-bl-md border border-[#E5E7EB] bg-white text-[#111827]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {m.content_text || `[${m.content_type ?? "media"}]`}
                        </p>
                        <p
                          className={`mt-1 text-[9px] ${
                            m.direction === "outbound" ? "text-white/70" : "text-[#9CA3AF]"
                          }`}
                        >
                          {new Date(m.created_at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {m.direction === "outbound" && ` · ${m.status}`}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={sendReply} className="flex items-center gap-2 border-t border-[#E5E7EB] p-3">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type a reply…"
                  className="flex-1 rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-xs font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#16A34A] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending || !reply.trim()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] disabled:opacity-40 transition-colors"
                >
                  {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
