import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMerchantSession } from "@/lib/merchant-session";
import { MerchantLoginForm } from "@/components/merchant/merchant-login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign In — EngageOS Merchant Portal",
  description: "Sign in to manage your business on EngageOS.",
  robots: { index: false, follow: false },
};

/** Allowlist of safe internal paths the `from` param may redirect to. */
function safeFrom(raw: string | undefined): string {
  if (!raw) return "/m/dashboard";
  // Must be an internal path starting with /m/ (never an absolute URL or other prefix)
  if (/^\/m\/[a-zA-Z0-9\-_/]*$/.test(raw)) return raw;
  return "/m/dashboard";
}

export default async function MerchantLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const from = safeFrom(params.from);

  // Redirect already-authenticated merchants back to where they came from
  const session = await getMerchantSession();
  if (session) {
    redirect(from);
  }

  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background decorations */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-20 size-96 rounded-full bg-gradient-to-br from-[#16A34A]/8 to-[#22C55E]/4 blur-3xl" />
        <div className="absolute -bottom-40 -right-20 size-96 rounded-full bg-gradient-to-tl from-[#16A34A]/6 to-transparent blur-3xl" />
        {/* Subtle grid pattern */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.015]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#111827" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative w-full max-w-sm">
        <MerchantLoginForm from={from} />
      </div>
    </main>
  );
}
