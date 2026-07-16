import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin-session";
import { OnboardForm } from "@/components/admin/onboard-form";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New merchant — EngageOS",
  robots: { index: false, follow: false },
};

export default async function NewMerchantPage() {
  if (!(await isAdmin())) redirect("/admin");

  return (
    <AdminShell back={{ href: "/admin", label: "Merchants" }}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Onboard a merchant
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Fill this in with the shop owner — it takes under a minute. Their
            campaign goes live the moment you finish.
          </p>
        </header>
        <OnboardForm />
      </div>
    </AdminShell>
  );
}
