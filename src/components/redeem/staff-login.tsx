"use client";

import { useState } from "react";

export function StaffLogin({ prefillStore }: { prefillStore?: string | null }) {
  const [store, setStore] = useState(prefillStore ?? "");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storeLocked = !!prefillStore;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessSlug: store.trim().toLowerCase(),
          pin: pin.trim(),
        }),
      });
      const json: unknown = await res.json();
      const data = json as { ok: true } | { ok: false; error: string };

      if (!data.ok) {
        setError(data.error);
        return;
      }
      window.location.reload(); // server component re-renders with session
    } catch {
      setError("Network problem. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-neutral-100 px-4">
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm"
      >
        <div className="text-center">
          <h1 className="text-xl font-bold text-neutral-900">Staff login</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Redeem customer coupons
          </p>
        </div>

        <div className={storeLocked ? "hidden" : undefined}>
          <label
            htmlFor="store-slug"
            className="mb-1 block text-sm font-medium text-neutral-800"
          >
            Store ID
          </label>
          <input
            id="store-slug"
            type="text"
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect="off"
            required
            readOnly={storeLocked}
            value={store}
            onChange={(e) => setStore(e.target.value)}
            placeholder="e.g. ammu-textiles"
            className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
        </div>

        <div>
          <label
            htmlFor="store-pin"
            className="mb-1 block text-sm font-medium text-neutral-800"
          >
            PIN
          </label>
          <input
            id="store-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            required
            minLength={4}
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="4-6 digits"
            className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-base outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-neutral-900 py-3.5 text-base font-semibold text-white active:bg-neutral-700 disabled:opacity-60"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
