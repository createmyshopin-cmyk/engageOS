"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/app/admin/actions";

const initial: ActionState = { error: null };

export function AdminLogin() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <main className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-neutral-50 px-4">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-emerald-100/40 to-teal-100/30 blur-3xl" />
        <div className="dots-pattern absolute inset-0 opacity-50" />
      </div>

      <div className="relative mx-auto w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-lg font-bold text-white shadow-lg shadow-emerald-500/25">
            E
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight text-neutral-900">
            EngageOS Operator
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Sign in to manage merchants and campaigns.
          </p>
        </div>

        <form
          action={action}
          className="space-y-4 rounded-2xl border border-neutral-200/70 bg-white p-6 shadow-xl shadow-neutral-900/5"
        >
          <div>
            <label
              htmlFor="admin-password"
              className="mb-1.5 block text-sm font-medium text-neutral-800"
            >
              Password
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••••"
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 outline-none transition-shadow placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
            />
          </div>
          {state.error && (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
              </svg>
              {state.error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-neutral-900 hover:bg-neutral-800 text-base font-semibold text-white shadow-sm transition-colors active:bg-neutral-950 disabled:opacity-60 cursor-pointer"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-neutral-400">
          Authorized operators only · EngageOS
        </p>
      </div>
    </main>
  );
}
