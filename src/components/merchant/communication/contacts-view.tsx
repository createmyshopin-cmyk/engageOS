"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { commFetch } from "./api";

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: { name: string }[];
}

export function ContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = q ? `?search=${encodeURIComponent(q)}&limit=50` : "?limit=50";
      const json = await commFetch<{ items: Contact[] }>(
        `/api/m/communication/contacts${qs}`
      );
      setContacts(json.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function createContact(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await commFetch("/api/m/communication/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), name: name.trim() || undefined }),
      });
      setPhone("");
      setName("");
      setShowForm(false);
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone…"
            className="flex-1 rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => load(search)}
            className="rounded-xl border border-[#E5E7EB] px-4 py-2 text-xs font-bold"
          >
            Search
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#111827] px-4 py-2 text-xs font-bold text-white"
        >
          <Plus className="size-3.5" />
          Add contact
        </button>
      </div>

      {showForm && (
        <form onSubmit={createContact} className="rounded-2xl border border-[#E5E7EB] bg-white p-4 grid sm:grid-cols-2 gap-3">
          <input
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (E.164)"
            className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="sm:col-span-2 rounded-xl bg-[#25D366] py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save contact"}
          </button>
        </form>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-[#6B7280]">
            <Loader2 className="size-4 animate-spin" />
            Loading contacts…
          </div>
        ) : contacts.length === 0 ? (
          <p className="p-6 text-sm text-[#6B7280]">No contacts found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB] text-left text-xs text-[#6B7280]">
              <tr>
                <th className="px-4 py-3 font-bold">Name</th>
                <th className="px-4 py-3 font-bold">Phone</th>
                <th className="px-4 py-3 font-bold">Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3F4F6]">
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.name || "—"}</td>
                  <td className="px-4 py-3">{c.phone}</td>
                  <td className="px-4 py-3 text-xs text-[#6B7280]">
                    {c.tags?.map((t) => t.name).join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
