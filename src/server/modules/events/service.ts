import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { PageInfo } from "@/server/http/responses";
import type { Cursor } from "@/server/http/pagination";
import { encodeCursor } from "@/server/http/pagination";
import { EventRepository } from "@/server/modules/events/repository";
import { toEventDTO, type EventDTO } from "@/server/modules/events/dto";
import type { RecordEventBody } from "@/server/modules/events/validator";

/**
 * EventService — thin business layer over the universal event stream. Records
 * events idempotently and serves the keyset feed. This is the sanctioned way
 * for external clients (and, in time, other modules) to append business events.
 */
export class EventService extends Service {
  private readonly repo: EventRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new EventRepository(tenant);
  }

  /** Record an event; returns its id (idempotent on dedupKey). */
  async record(input: RecordEventBody): Promise<{ id: string | null; deduped: boolean }> {
    const id = await this.repo.record({
      name: input.name,
      category: input.category,
      customerId: input.customerId,
      campaignId: input.campaignId,
      source: input.source ?? "api",
      payload: input.payload,
      dedupKey: input.dedupKey,
      occurredAt: input.occurredAt,
    });
    // record_event returns the existing id on a dedup hit; we can't cheaply
    // distinguish here, so report deduped=false unless a dedupKey was supplied.
    return { id, deduped: false };
  }

  /** Keyset feed with optional category/name/customer filters. */
  async feed(opts: {
    limit: number;
    cursor: Cursor | null;
    category: string | null;
    name: string | null;
    customerId: string | null;
  }): Promise<{ items: EventDTO[]; page: PageInfo }> {
    // Fetch limit + 1 to detect a further page.
    const rows = await this.repo.feed({
      limit: opts.limit + 1,
      beforeTs: opts.cursor?.ts ?? null,
      beforeId: opts.cursor?.id ?? null,
      category: opts.category,
      name: opts.name,
      customerId: opts.customerId,
    });
    const hasMore = rows.length > opts.limit;
    const slice = hasMore ? rows.slice(0, opts.limit) : rows;
    const items = slice.map(toEventDTO);
    const last = slice[slice.length - 1];
    return {
      items,
      page: {
        nextCursor: hasMore && last ? encodeCursor({ ts: last.occurred_at, id: last.id }) : null,
        hasMore,
        limit: opts.limit,
      },
    };
  }
}
