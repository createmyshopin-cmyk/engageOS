import "server-only";
import { adminClient } from "@/lib/db/rpc";
import type { Customer } from "@/lib/types";

/** All customers for a business, newest first. */
export async function getAllCustomers(businessId: string): Promise<Customer[]> {
  const supabase = adminClient();
  const pageSize = 1000;
  const all: Customer[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, business_id, phone, name, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`customers fetch failed: ${error.message}`);
    all.push(...(data as Customer[]));
    if (!data || data.length < pageSize) break;
  }
  return all;
}
