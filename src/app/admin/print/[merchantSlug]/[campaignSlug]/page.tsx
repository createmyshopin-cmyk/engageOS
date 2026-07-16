import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ merchantSlug: string; campaignSlug: string }>;
}

export default async function PrintRedirectPage({ params }: PageProps) {
  const { merchantSlug, campaignSlug } = await params;
  redirect(`/m/campaigns/print/${merchantSlug}/${campaignSlug}`);
}
