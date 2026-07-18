import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { EventRow } from "@/server/modules/events/dto";

/**
 * EventRepository — writes go through record_event (idempotent via dedup_key),
 * reads through the events_feed keyset RPC. Both are tenant-scoped by the
 * business_id passed to the SECURITY DEFINER function.
 */
export class EventRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  /** Append an event; returns the (new or pre-existing, on dedup) event id. */
  async record(input: {
    name: string;
    category: string;
    customerId?: string;
    campaignId?: string;
    source?: string;
    payload?: Record<string, unknown>;
    dedupKey?: string;
    occurredAt?: string;
  }): Promise<string | null> {
    return this.tenant.rpcScalar<string>("record_event", {
      p_business_id: this.businessId,
      p_event_name: input.name,
      p_category: input.category,
      p_customer_id: input.customerId ?? null,
      p_campaign_id: input.campaignId ?? null,
      p_source: input.source ?? "system",
      p_payload: input.payload ?? {},
      p_dedup_key: input.dedupKey ?? null,
      p_occurred_at: input.occurredAt ?? null,
    });
  }

  /** Keyset-paginated tenant event feed. */
  async feed(opts: {
    limit: number;
    beforeTs: string | null;
    beforeId: string | null;
    category: string | null;
    name: string | null;
    customerId: string | null;
  }): Promise<EventRow[]> {
    return this.tenant.rpcSelect<EventRow>("events_feed", {
      p_business_id: this.businessId,
      p_limit: opts.limit,
      p_before_ts: opts.beforeTs,
      p_before_id: opts.beforeId,
      p_category: opts.category,
      p_name: opts.name,
      p_customer_id: opts.customerId,
    });
  }
}
