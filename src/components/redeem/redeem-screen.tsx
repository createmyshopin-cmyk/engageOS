"use client";

import { useRef, useState } from "react";
import type { RedeemResult } from "@/lib/types";

interface RedeemScreenProps {
  businessName: string;
}

type Verdict =
  | { kind: "valid"; prizeName: string; customerName: string }
  | { kind: "already"; redeemedAt: string }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "error"; message: string };

export function RedeemScreen({ businessName }: RedeemScreenProps) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setVerdict(null);
    setCode("");
    // Refocus so staff can type the next code immediately.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (checking) return;

    const normalized = normalizeCode(code);
    if (!/^ONAM-[A-Z2-9]{4}$/.test(normalized)) {
      setVerdict({ kind: "error", message: "Enter the 4 characters after ONAM-" });
      return;
    }

    setChecking(true);
    try {
      const res = await fetch("/api/staff/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });

      if (res.status === 401) {
        alert("Shift login expired — please enter your PIN again.");
        window.location.reload(); // server shows the login screen
        return;
      }

      const json: unknown = await res.json();
      const data = json as
        | { ok: true; result: RedeemResult }
        | { ok: false; error: string };

      if (!data.ok) {
        setVerdict({ kind: "error", message: data.error });
        return;
      }

      const r = data.result;
      switch (r.status) {
        case "redeemed":
          setVerdict({
            kind: "valid",
            prizeName: r.prize_name,
            customerName: r.customer_name,
          });
          break;
        case "already_redeemed":
          setVerdict({ kind: "already", redeemedAt: r.redeemed_at });
          break;
        case "expired":
          setVerdict({ kind: "expired" });
          break;
        case "invalid_code":
        case "wrong_business":
          // wrong_business shown as invalid: staff don't need tenant details.
          setVerdict({ kind: "invalid" });
          break;
      }
    } catch {
      setVerdict({ kind: "error", message: "Network problem. Try again." });
    } finally {
      setChecking(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/staff/logout", { method: "POST" });
    window.location.reload();
  }

  if (verdict && verdict.kind !== "error") {
    return <VerdictScreen verdict={verdict} onNext={reset} />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-100">
      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-neutral-900">{businessName}</p>
          <p className="text-xs text-neutral-500">Coupon redemption</p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 active:bg-neutral-100"
        >
          Log out
        </button>
      </header>

      <main className="flex flex-1 flex-col justify-center px-4 pb-24">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-4">
          <label
            htmlFor="coupon-code"
            className="block text-center text-base font-medium text-neutral-800"
          >
            Enter coupon code
          </label>

          <div className="flex items-center gap-2 rounded-2xl border-2 border-neutral-300 bg-white px-4 py-3 focus-within:border-amber-500">
            <span className="font-mono text-2xl font-bold text-neutral-400">
              ONAM-
            </span>
            <input
              ref={inputRef}
              id="coupon-code"
              type="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={4}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX"
              className="w-full bg-transparent font-mono text-2xl font-bold tracking-widest text-neutral-900 outline-none placeholder:text-neutral-300"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- single-purpose kiosk screen; focus IS the flow
              autoFocus
            />
          </div>

          {verdict?.kind === "error" && (
            <p role="alert" className="text-center text-sm text-red-600">
              {verdict.message}
            </p>
          )}

          <button
            type="submit"
            disabled={checking || code.length < 4}
            className="w-full rounded-2xl bg-neutral-900 py-4 text-lg font-semibold text-white active:bg-neutral-700 disabled:opacity-40"
          >
            {checking ? "Checking…" : "Check coupon"}
          </button>
        </form>
      </main>
    </div>
  );
}

function normalizeCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s/g, "");
  return cleaned.startsWith("ONAM-") ? cleaned : `ONAM-${cleaned}`;
}

function VerdictScreen({
  verdict,
  onNext,
}: {
  verdict: Exclude<Verdict, { kind: "error" }>;
  onNext: () => void;
}) {
  const styles: Record<string, { bg: string; icon: string; title: string }> = {
    valid: { bg: "bg-emerald-600", icon: "✓", title: "VALID" },
    already: { bg: "bg-red-600", icon: "✕", title: "ALREADY USED" },
    invalid: { bg: "bg-red-600", icon: "✕", title: "INVALID CODE" },
    expired: { bg: "bg-amber-600", icon: "!", title: "EXPIRED" },
  };
  const s = styles[verdict.kind];

  return (
    <div className={`flex min-h-dvh flex-col ${s.bg}`}>
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center text-white">
        <div
          aria-hidden
          className="flex h-24 w-24 items-center justify-center rounded-full bg-white/20 text-6xl font-bold"
        >
          {s.icon}
        </div>
        <h1 className="mt-6 text-4xl font-extrabold tracking-wide">{s.title}</h1>

        {verdict.kind === "valid" && (
          <>
            <p className="mt-4 text-2xl font-semibold">{verdict.prizeName}</p>
            <p className="mt-1 text-white/80">for {verdict.customerName}</p>
            <p className="mt-6 rounded-xl bg-white/15 px-4 py-2 text-sm">
              Give the customer this prize now
            </p>
          </>
        )}
        {verdict.kind === "already" && (
          <p className="mt-4 text-white/90">
            Redeemed on{" "}
            {new Date(verdict.redeemedAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}
        {verdict.kind === "invalid" && (
          <p className="mt-4 text-white/90">
            This code doesn&apos;t exist for your store. Check the spelling.
          </p>
        )}
        {verdict.kind === "expired" && (
          <p className="mt-4 text-white/90">This coupon&apos;s validity has ended.</p>
        )}
      </main>

      <div className="p-4 pb-8">
        <button
          onClick={onNext}
          className="w-full rounded-2xl bg-white py-4 text-lg font-semibold text-neutral-900 active:bg-neutral-200"
        >
          Next coupon
        </button>
      </div>
    </div>
  );
}
