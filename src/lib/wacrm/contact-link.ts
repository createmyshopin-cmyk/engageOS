import "server-only";

import { adminClient as supabaseAdmin } from "@/lib/db/rpc";
import { getWacrmForBusiness } from "@/lib/wacrm/adapter";

/**
 * Resolve an EngageOS customer from a WACRM contact id.
 * Tries local wacrm_contact_id first, then WACRM GET /contacts/{id} by phone.
 */
export async function resolveCustomerFromWacrmContact(
  businessId: string,
  wacrmContactId: string
): Promise<{ customerId: string | null; phone: string | null }> {
  const { data: byLink } = await supabaseAdmin()
    .from("customers")
    .select("id, phone")
    .eq("business_id", businessId)
    .eq("wacrm_contact_id", wacrmContactId)
    .maybeSingle<{ id: string; phone: string }>();

  if (byLink) {
    return { customerId: byLink.id, phone: byLink.phone };
  }

  try {
    const tenant = await getWacrmForBusiness(businessId);
    if (!tenant) return { customerId: null, phone: null };

    const contact = await tenant.client.getContact(wacrmContactId);
    const { data: byPhone } = await supabaseAdmin()
      .from("customers")
      .select("id, phone, wacrm_contact_id")
      .eq("business_id", businessId)
      .eq("phone", contact.phone)
      .maybeSingle<{ id: string; phone: string; wacrm_contact_id: string | null }>();

    if (byPhone) {
      if (byPhone.wacrm_contact_id !== wacrmContactId) {
        await supabaseAdmin()
          .from("customers")
          .update({ wacrm_contact_id: wacrmContactId })
          .eq("business_id", businessId)
          .eq("id", byPhone.id);
      }
      return { customerId: byPhone.id, phone: byPhone.phone };
    }

    return { customerId: null, phone: contact.phone };
  } catch (err) {
    console.error("resolveCustomerFromWacrmContact failed:", err);
    return { customerId: null, phone: null };
  }
}
