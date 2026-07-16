"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Search, Tag, UserX, UserCheck, Loader2 } from "lucide-react";
import { LoadingPanel } from "./overview-tab";
import { fetchAdapter } from "./api";

interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
  company: string | null;
  tags: { id: string; name: string; color: string | null }[];
  created_at: string;
}

/** Contacts tab — live read of the tenant's wacrm contacts (CRM of record). */
export function ContactsTab() {
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyPhone, setBusyPhone] = useState<string | null>(null);

  const load = useCallback(async (q: string, cursor?: string) => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (cursor) params.set("cursor", cursor);
    return fetchAdapter(`/api/m/whatsapp/contacts?${params}`);
  }, []);

  const refresh = useCallback(
    async (q: string) => {
      setError(null);
      setContacts(null);
      try {
        const json = await load(q);
        if (!json.ok) throw new Error(json.error);
        setContacts(json.contacts);
        setNextCursor(json.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load contacts");
        setContacts([]);
      }
    },
    [load]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      refresh("");
    }, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const json = await load(search, nextCursor);
      if (json.ok) {
        setContacts((prev) => [...(prev ?? []), ...json.contacts]);
        setNextCursor(json.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleOptOut(contact: ContactRow, optOut: boolean) {
    setBusyPhone(contact.phone);
    try {
      const json = await fetchAdapter("/api/m/whatsapp/contacts/opt-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: contact.phone, optOut }),
      });
      if (json.ok) await refresh(search);
      else setError(json.error ?? "Failed to update opt-out");
    } finally {
      setBusyPhone(null);
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          refresh(search);
        }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone…"
            className="w-full rounded-xl border border-[#E5E7EB] bg-white py-2.5 pl-9 pr-3 text-xs font-medium text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#16A34A] focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl bg-[#16A34A] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#15803D] transition-colors"
        >
          Search
        </button>
        <span className="ml-auto hidden text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] sm:block">
          Live from wacrm — synced on every registration
        </span>
      </form>

      {error && (
        <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-xs font-bold text-[#B91C1C]">
          {error}
        </div>
      )}

      {contacts === null ? (
        <LoadingPanel label="Loading contacts from wacrm…" />
      ) : contacts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#D1D5DB] bg-white py-12 text-center text-xs font-bold text-[#6B7280]">
          No contacts yet. Customers appear here automatically when they register on a campaign.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#E5E7EB] bg-[#F8FAFC]">
                <Th>Contact</Th>
                <Th>Phone</Th>
                <Th>Tags</Th>
                <Th className="text-right pr-5">Messaging</Th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const optedOut = c.tags.some((t) => t.name === "opted-out");
                return (
                  <tr key={c.id} className="border-b border-[#F3F4F6] last:border-0">
                    <td className="px-5 py-3">
                      <p className="text-xs font-bold text-[#111827]">{c.name ?? "—"}</p>
                      {c.company && (
                        <p className="text-[10px] font-medium text-[#9CA3AF]">{c.company}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs font-medium text-[#374151]">{c.phone}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.length === 0 && (
                          <span className="text-[10px] text-[#9CA3AF]">—</span>
                        )}
                        {c.tags.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-2 py-0.5 text-[9px] font-bold text-[#374151]"
                          >
                            <Tag className="size-2.5" style={{ color: t.color ?? "#9CA3AF" }} />
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => toggleOptOut(c, !optedOut)}
                        disabled={busyPhone === c.phone}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                          optedOut
                            ? "border-[#16A34A]/30 bg-[#F0FDF4] text-[#16A34A] hover:bg-[#DCFCE7]"
                            : "border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#B91C1C] hover:border-[#FCA5A5]"
                        }`}
                      >
                        {busyPhone === c.phone ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : optedOut ? (
                          <UserCheck className="size-3" />
                        ) : (
                          <UserX className="size-3" />
                        )}
                        {optedOut ? "Opt back in" : "Opt out"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {nextCursor && (
            <div className="border-t border-[#F3F4F6] p-3 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-xs font-bold text-[#16A34A] hover:text-[#166534]"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF] ${className}`}
    >
      {children}
    </th>
  );
}
