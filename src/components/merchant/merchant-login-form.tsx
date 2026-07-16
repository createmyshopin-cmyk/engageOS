"use client";

import { useActionState, useState } from "react";
import { merchantLoginAction, merchantForgotAction, type MerchantAuthState } from "@/app/m/login/actions";
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";

export function MerchantLoginForm({ from = "/m/dashboard" }: { from?: string }) {
  const initial: MerchantAuthState = { error: null };
  const [loginState, loginAction, loginPending] = useActionState(merchantLoginAction, initial);
  const [forgotState, forgotAction, forgotPending] = useActionState(merchantForgotAction, initial);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [forgotSent, setForgotSent] = useState(false);

  // Handle forgot success
  const handleForgotSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    // Will be set after action resolves
    if (!forgotState.error && forgotSent) return;
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-[#16A34A] to-[#15803D] shadow-xl shadow-green-500/30 mb-4">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <path d="M8 16C8 11.582 11.582 8 16 8s8 3.582 8 8-3.582 8-8 8-8-3.582-8-8z" fill="white" fillOpacity="0.3"/>
            <path d="M16 4C9.373 4 4 9.373 4 16s5.373 12 12 12 12-5.373 12-12S22.627 4 16 4zm0 2c5.523 0 10 4.477 10 10S21.523 26 16 26 6 21.523 6 16 10.477 6 16 6zm0 4a6 6 0 100 12A6 6 0 0016 10zm0 2a4 4 0 110 8 4 4 0 010-8z" fill="white"/>
          </svg>
        </div>
        <h1 className="text-2xl font-black text-[#111827] tracking-tight">EngageOS</h1>
        {mode === "login" ? (
          <div className="text-center mt-2 px-2">
            <p className="text-sm font-bold text-[#111827] mb-1">Welcome back 👋</p>
            <p className="text-xs text-[#6B7280] font-medium leading-relaxed">
              Manage your campaigns, customers, rewards, and WhatsApp engagement from one place.
            </p>
          </div>
        ) : (
          <p className="text-sm text-[#6B7280] font-medium mt-1">
            Reset your password
          </p>
        )}
      </div>

      {/* Card */}
      <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-xl shadow-black/5 p-7">

        {/* ── LOGIN MODE ── */}
        {mode === "login" && (
          <form action={loginAction} className="space-y-5">
            {/* Hidden: redirect destination after login */}
            <input type="hidden" name="from" value={from} />
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-bold text-[#111827]">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="owner@yourshop.com"
                aria-describedby={loginState.field === "email" ? "email-error" : undefined}
                className={`w-full rounded-xl border px-4 py-3 text-sm text-[#111827] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-4 ${
                  loginState.field === "email"
                    ? "border-[#EF4444] focus:ring-red-500/10 bg-red-50"
                    : "border-[#E5E7EB] focus:border-[#16A34A] focus:ring-[#16A34A]/10 bg-white"
                }`}
              />
              {loginState.field === "email" && (
                <p id="email-error" role="alert" className="flex items-center gap-1.5 text-xs text-[#EF4444] font-medium">
                  <AlertCircle className="size-3.5 shrink-0" />
                  {loginState.error}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-bold text-[#111827]">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-xs font-bold text-[#16A34A] hover:text-[#166534] transition-colors"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  aria-describedby={loginState.field === "password" ? "password-error" : undefined}
                  className={`w-full rounded-xl border px-4 py-3 pr-12 text-sm text-[#111827] outline-none transition-all placeholder:text-[#9CA3AF] focus:ring-4 ${
                    loginState.field === "password"
                      ? "border-[#EF4444] focus:ring-red-500/10 bg-red-50"
                      : "border-[#E5E7EB] focus:border-[#16A34A] focus:ring-[#16A34A]/10 bg-white"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280] transition-colors p-0.5"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {loginState.field === "password" && (
                <p id="password-error" role="alert" className="flex items-center gap-1.5 text-xs text-[#EF4444] font-medium">
                  <AlertCircle className="size-3.5 shrink-0" />
                  {loginState.error}
                </p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2.5">
              <input
                id="rememberMe"
                name="rememberMe"
                type="checkbox"
                className="size-4 rounded border-[#E5E7EB] text-[#16A34A] focus:ring-[#16A34A]/20 accent-[#16A34A] cursor-pointer"
              />
              <label htmlFor="rememberMe" className="text-sm text-[#6B7280] font-medium cursor-pointer select-none">
                Remember me for 30 days
              </label>
            </div>

            {/* General error */}
            {loginState.error && loginState.field === "general" && (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-200/60 px-4 py-3">
                <AlertCircle className="size-4 text-[#EF4444] shrink-0 mt-0.5" />
                <p className="text-sm text-[#EF4444] font-medium leading-snug">{loginState.error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loginPending}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] hover:bg-[#166534] active:bg-[#15803D] text-white text-sm font-black py-3.5 shadow-lg shadow-green-500/25 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {loginPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in to Dashboard"
              )}
            </button>
          </form>
        )}

        {/* ── FORGOT PASSWORD MODE ── */}
        {mode === "forgot" && (
          <div>
            <button
              onClick={() => { setMode("login"); setForgotSent(false); }}
              className="flex items-center gap-1.5 text-xs font-bold text-[#6B7280] hover:text-[#111827] transition-colors mb-5"
            >
              <ArrowLeft className="size-3.5" />
              Back to sign in
            </button>

            {forgotSent ? (
              <div className="flex flex-col items-center text-center py-4">
                <div className="flex items-center justify-center size-12 rounded-full bg-[#DCFCE7] mb-4">
                  <CheckCircle2 className="size-6 text-[#16A34A]" />
                </div>
                <p className="text-sm font-black text-[#111827]">Check your email</p>
                <p className="text-xs text-[#6B7280] mt-1.5 leading-relaxed">
                  If an account exists for that email, we&apos;ll send password reset instructions shortly.
                </p>
                <button
                  onClick={() => { setMode("login"); setForgotSent(false); }}
                  className="mt-5 text-xs font-bold text-[#16A34A] hover:text-[#166534] transition-colors"
                >
                  Return to sign in →
                </button>
              </div>
            ) : (
              <form
                action={forgotAction}
                onSubmit={handleForgotSubmit}
                className="space-y-5"
              >
                <div className="space-y-1.5">
                  <label htmlFor="forgot-email" className="block text-sm font-bold text-[#111827]">
                    Email address
                  </label>
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="owner@yourshop.com"
                    className="w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm text-[#111827] outline-none transition-all placeholder:text-[#9CA3AF] focus:border-[#16A34A] focus:ring-4 focus:ring-[#16A34A]/10 bg-white"
                  />
                  {forgotState.error && (
                    <p role="alert" className="flex items-center gap-1.5 text-xs text-[#EF4444] font-medium">
                      <AlertCircle className="size-3.5 shrink-0" />
                      {forgotState.error}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={forgotPending}
                  onClick={() => { if (!forgotState.error) setForgotSent(true); }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#16A34A] hover:bg-[#166534] text-white text-sm font-black py-3.5 shadow-lg shadow-green-500/25 transition-all disabled:opacity-60 cursor-pointer"
                >
                  {forgotPending ? (
                    <><Loader2 className="size-4 animate-spin" /> Sending…</>
                  ) : (
                    "Send reset instructions"
                  )}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-[#9CA3AF] mt-6 font-medium">
        Powered by <span className="font-black text-[#6B7280]">EngageOS</span> · Authorized merchants only
      </p>
    </div>
  );
}
