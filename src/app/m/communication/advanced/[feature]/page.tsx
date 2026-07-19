import { notFound } from "next/navigation";
import { isWacrmAdvancedFeature } from "@/lib/wacrm/features";
import { WacrmAdvancedEmbed } from "@/components/merchant/communication/advanced-embed";

export default async function CommunicationAdvancedPage({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = await params;
  if (!isWacrmAdvancedFeature(feature)) {
    notFound();
  }

  return <WacrmAdvancedEmbed featureId={feature} />;
}
