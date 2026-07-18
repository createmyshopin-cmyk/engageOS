import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { Cursor } from "@/server/http/pagination";
import type { CustomerRow, CustomerListRow, TimelineRow } from "@/server/modules/customers/transformer";
import type { Customer360DTO } from "@/server/modules/customers/dto";

/**
 * CustomerRepository — all customer data access, tenant-scoped via the bound
 * TenantRepository. Reads use the auto-scoped select builder with keyset
 * pagination; writes go exclusively through the 0034 SECURITY DEFINER RPCs so
 * invariants (dedup, consent mirroring, merge repointing) stay in SQL.
 */

const LIST_COLUMNS = "id, phone, name, email, created_at";
const PROFILE_COLUMNS =
  "id, phone, name, full_name, email, gender, birthday, anniversary, language, " +
  "timezone, source, marketing_opt_in, email_opt_in, sms_opt_in, wa_opt_out, created_at, updated_at";

export class CustomerRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  /**
   * Keyset-paginated customer list, newest-first by (created_at, id). Fetches
   * limit + 1 to detect a further page. Optional case-insensitive search over
   * name/phone/email. Excludes soft-deleted rows.
   */
  async list(opts: {
    limit: number;
    cursor: Cursor | null;
    search: string | null;
    direction: "asc" | "desc";
  }): Promise<CustomerListRow[]> {
    let q = this.tenant
      .select("customers", LIST_COLUMNS)
      .is("deleted_at", null);

    if (opts.search) {
      const term = `%${opts.search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      q = q.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
    }

    const ascending = opts.direction === "asc";
    // Keyset: for desc, next page is rows strictly "before" the cursor tuple.
    if (opts.cursor) {
      const op = ascending ? "gt" : "lt";
      // (created_at, id) tuple comparison via or() for the tie-break on id.
      q = q.or(
        `created_at.${op}.${opts.cursor.ts},and(created_at.eq.${opts.cursor.ts},id.${op}.${opts.cursor.id})`
      );
    }

    q = q
      .order("created_at", { ascending })
      .order("id", { ascending })
      .limit(opts.limit + 1);

    const { data, error } = await q;
    if (error) throw new Error(`customers.list failed: ${error.message}`);
    return (data ?? []) as unknown as CustomerListRow[];
  }

  /** Fetch one customer's full profile, tenant-scoped. Null if not found/foreign. */
  async findById(customerId: string): Promise<CustomerRow | null> {
    const { data, error } = await this.tenant
      .select("customers", PROFILE_COLUMNS)
      .eq("id", customerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(`customers.findById failed: ${error.message}`);
    return (data as unknown as CustomerRow | null) ?? null;
  }

  /** Upsert by (business_id, phone) via RPC; returns the customer id. */
  async upsert(input: {
    phone: string;
    name?: string;
    email?: string;
    gender?: string;
    birthday?: string;
    anniversary?: string;
    language?: string;
    timezone?: string;
    source?: string;
  }): Promise<string> {
    const id = await this.tenant.rpcScalar<string>("merchant_upsert_customer", {
      p_business_id: this.businessId,
      p_phone: input.phone,
      p_name: input.name ?? null,
      p_email: input.email ?? null,
      p_gender: input.gender ?? null,
      p_birthday: input.birthday ?? null,
      p_anniversary: input.anniversary ?? null,
      p_language: input.language ?? null,
      p_timezone: input.timezone ?? null,
      p_source: input.source ?? null,
    });
    if (!id) throw new Error("merchant_upsert_customer returned no id");
    return id;
  }

  /** Record a consent change (mirrors the customers boolean server-side). */
  async setConsent(customerId: string, channel: string, status: string, source?: string): Promise<void> {
    await this.tenant.callRpc("merchant_set_consent", {
      p_business_id: this.businessId,
      p_customer_id: customerId,
      p_channel: channel,
      p_status: status,
      p_source: source ?? "api",
    });
  }

  /** Attach a tag (upserts the tag catalog + map). Returns the tag id. */
  async addTag(customerId: string, name: string, color?: string): Promise<string> {
    const tagId = await this.tenant.rpcScalar<string>("merchant_add_customer_tag", {
      p_business_id: this.businessId,
      p_customer_id: customerId,
      p_tag_name: name,
      p_color: color ?? null,
    });
    if (!tagId) throw new Error("merchant_add_customer_tag returned no id");
    return tagId;
  }

  /** Soft-delete a customer (sets deleted_at). */
  async softDelete(customerId: string): Promise<void> {
    await this.tenant.callRpc("soft_delete_customer", {
      p_business_id: this.businessId,
      p_customer_id: customerId,
    });
  }

  /** Merge duplicate into survivor (repoints all references in SQL). */
  async merge(survivorId: string, duplicateId: string): Promise<void> {
    await this.tenant.callRpc("merge_customers", {
      p_business_id: this.businessId,
      p_survivor_id: survivorId,
      p_duplicate_id: duplicateId,
    });
  }

  /** The customer-360 JSON bundle for a customer. */
  async customer360(customerId: string): Promise<Customer360DTO | null> {
    return this.tenant.rpcScalar<Customer360DTO>("merchant_customer_360", {
      p_business_id: this.businessId,
      p_customer_id: customerId,
    });
  }

  /** Keyset-paginated unified timeline (funnel log + universal events). */
  async timeline(customerId: string, limit: number, before: string | null): Promise<TimelineRow[]> {
    return this.tenant.rpcSelect<TimelineRow>("customer_timeline_unified", {
      p_business_id: this.businessId,
      p_customer_id: customerId,
      p_limit: limit,
      p_before: before,
    });
  }
}
