"use client";

import { useActionState } from "react";
import { createMerchantAccountAction, type ActionState } from "@/app/admin/actions";
import { Loader2, AlertCircle, CheckCircle2, UserPlus } from "lucide-react";

const initial: ActionState = { error: null };

interface CreateMerchantAccountFormProps {
  businessId: string;
}

export function CreateMerchantAccountForm({ businessId }: CreateMerchantAccountFormProps) {
  const [state, action, pending] = useActionState(createMerchantAccountAction, initial);

  if (state.error === null && state !== initial) {
    // Success state
    return (
      <div className="flex flex-col items-center justify-center text-center py-6 gap-3">
        <div className="flex items-center justify-center size-12 rounded-full bg-emerald-50">
          <CheckCircle2 className="size-6 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-neutral-900">Merchant account created</p>
          <p className="text-xs text-neutral-500 mt-0.5">They can now sign in at <strong>/m/login</strong></p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="business_id" value={businessId} />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="ma-name" className="block text-xs font-bold text-neutral-700">Full Name</label>
          <input
            id="ma-name"
            name="name"
            type="text"
            required
            minLength={2}
            placeholder="Shop Owner"
            className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 placeholder:text-neutral-400"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="ma-role" className="block text-xs font-bold text-neutral-700">Role</label>
          <select
            id="ma-role"
            name="role"
            className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10"
          >
            <option value="owner">Owner</option>
            <option value="manager">Manager</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="ma-email" className="block text-xs font-bold text-neutral-700">Email address</label>
        <input
          id="ma-email"
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="owner@yourshop.com"
          className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 placeholder:text-neutral-400"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="ma-password" className="block text-xs font-bold text-neutral-700">
          Password <span className="text-neutral-400 font-normal">(min 8 chars)</span>
        </label>
        <input
          id="ma-password"
          name="password"
          type="text"
          required
          minLength={8}
          placeholder="Set a strong password"
          autoComplete="new-password"
          className="w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 placeholder:text-neutral-400"
        />
      </div>

      {state.error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold py-3 transition-colors disabled:opacity-60 cursor-pointer"
      >
        {pending ? (
          <><Loader2 className="size-4 animate-spin" /> Creating…</>
        ) : (
          <><UserPlus className="size-4" /> Create Merchant Account</>
        )}
      </button>
    </form>
  );
}
