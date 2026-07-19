import Link from "next/link";
import { Plug } from "lucide-react";

export function CommunicationConnectBanner() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
        <Plug className="size-4" />
        WhatsApp CRM not connected
      </div>
      <p className="text-xs text-amber-800">
        Connect WACRM in Integrations to use Inbox, Contacts, and Broadcasts from EngageOS.
      </p>
      <Link
        href="/m/integrations/wacrm"
        className="inline-flex rounded-xl bg-amber-900 px-4 py-2 text-xs font-bold text-white hover:bg-amber-950"
      >
        Connect WACRM
      </Link>
    </div>
  );
}
