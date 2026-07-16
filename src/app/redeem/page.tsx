import type { Metadata } from "next";
import { getStaffSession } from "@/lib/staff-session";
import { StaffLogin } from "@/components/redeem/staff-login";
import { RedeemScreen } from "@/components/redeem/redeem-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Redeem coupons — EngageOS",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ store?: string }>;
}

export default async function RedeemPage({ searchParams }: PageProps) {
  const session = await getStaffSession();

  if (!session) {
    const { store } = await searchParams;
    const prefill =
      typeof store === "string" && /^[a-z0-9-]{2,40}$/.test(store)
        ? store
        : null;
    return <StaffLogin prefillStore={prefill} />;
  }
  return <RedeemScreen businessName={session.businessName} />;
}
