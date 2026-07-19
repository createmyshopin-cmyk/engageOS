import "server-only";
import { Service } from "@/server/core/Service";
import { NotFoundError } from "@/server/core/errors";
import { buildPage, decodeCursor, type Cursor } from "@/server/http/pagination";
import { buildCustomersCsv } from "@/server/modules/customers/csv";
import { buildCustomersXlsx } from "@/server/modules/customers/excel";
import type { CustomerExportFormat } from "@/server/modules/customers/validator";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { CustomerRepository } from "@/server/modules/customers/repository";
import {
  toCustomerDTO,
  toListItemDTO,
  toTimelineEntryDTO,
} from "@/server/modules/customers/transformer";
import type {
  CustomerDTO,
  CustomerListItemDTO,
  Customer360DTO,
  TimelineEntryDTO,
} from "@/server/modules/customers/dto";
import type { PageInfo } from "@/server/http/responses";

/**
 * CustomerService — all customer business logic. Orchestrates the repository,
 * enforces existence, maps rows to DTOs, and emits audit trail entries. Holds
 * no SQL and no HTTP concerns; tenancy arrives as a constructor argument.
 */
export class CustomerService extends Service {
  private readonly repo: CustomerRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.repo = new CustomerRepository(tenant);
  }

  /** Paginated list with optional search + filters. */
  async list(opts: {
    limit: number;
    cursor: Cursor | null;
    search: string | null;
    direction: "asc" | "desc";
    rewardFilter: string;
    joinedDays: number | null;
    joinedFrom: string | null;
    joinedTo: string | null;
  }): Promise<{ items: CustomerListItemDTO[]; page: PageInfo }> {
    const rows = await this.repo.list(opts);
    const { items, page } = buildPage(rows, opts.limit, (r) => ({
      ts: r.created_at,
      id: r.id,
    } satisfies Cursor));
    return { items: items.map(toListItemDTO), page };
  }

  /** Export all matching campaign customers as CSV or Excel (capped). */
  async exportCustomers(
    opts: {
      search: string | null;
      rewardFilter: string;
      joinedDays: number | null;
      joinedFrom: string | null;
      joinedTo: string | null;
    },
    format: CustomerExportFormat = "csv"
  ): Promise<{
    body: string | Buffer;
    filename: string;
    rowCount: number;
    format: CustomerExportFormat;
    contentType: string;
  }> {
    const limit = 100;
    const maxRows = 10_000;
    const all: CustomerListItemDTO[] = [];
    let cursor: Cursor | null = null;

    while (all.length < maxRows) {
      const { items, page } = await this.list({
        limit,
        cursor,
        direction: "desc",
        ...opts,
      });
      all.push(...items);
      if (!page.hasMore || !page.nextCursor) break;
      cursor = decodeCursor(page.nextCursor);
    }

    const rows = all.map((r) => ({
      name: r.name,
      phone: r.phone,
      email: r.email,
      createdAt: r.createdAt,
      latestCode: r.latestCode,
      latestPrizeName: r.latestPrizeName,
      rewardCount: r.rewardCount,
    }));

    const date = new Date().toISOString().slice(0, 10);
    if (format === "xlsx") {
      return {
        body: buildCustomersXlsx(rows),
        filename: `campaign-customers-${date}.xlsx`,
        rowCount: all.length,
        format,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    }

    return {
      body: buildCustomersCsv(rows),
      filename: `campaign-customers-${date}.csv`,
      rowCount: all.length,
      format,
      contentType: "text/csv; charset=utf-8",
    };
  }

  /** Full profile or 404. */
  async get(customerId: string): Promise<CustomerDTO> {
    const row = await this.repo.findById(customerId);
    if (!row) throw new NotFoundError("Customer not found");
    return toCustomerDTO(row);
  }

  /** The customer-360 bundle or 404. */
  async get360(customerId: string): Promise<Customer360DTO> {
    // Ensure the customer belongs to this tenant before assembling the bundle.
    const row = await this.repo.findById(customerId);
    if (!row) throw new NotFoundError("Customer not found");
    const bundle = await this.repo.customer360(customerId);
    if (!bundle) throw new NotFoundError("Customer not found");
    return bundle;
  }

  /** Upsert by phone; returns the resulting full profile. */
  async upsert(
    tenant: TenantRepository,
    input: Parameters<CustomerRepository["upsert"]>[0]
  ): Promise<CustomerDTO> {
    const id = await this.repo.upsert(input);
    await tenant.audit("customer.upsert", "customer", id, { via: "api", phone: input.phone });
    return this.get(id);
  }

  /** Set a consent flag; returns the refreshed profile. */
  async setConsent(
    tenant: TenantRepository,
    customerId: string,
    channel: string,
    status: string,
    source?: string
  ): Promise<CustomerDTO> {
    await this.assertExists(customerId);
    await this.repo.setConsent(customerId, channel, status, source);
    await tenant.audit("customer.consent", "customer", customerId, { channel, status });
    return this.get(customerId);
  }

  /** Attach a tag; returns the new tag id. */
  async addTag(
    tenant: TenantRepository,
    customerId: string,
    name: string,
    color?: string
  ): Promise<{ tagId: string }> {
    await this.assertExists(customerId);
    const tagId = await this.repo.addTag(customerId, name, color);
    await tenant.audit("customer.tag.add", "customer", customerId, { name });
    return { tagId };
  }

  /** Soft-delete a customer. */
  async remove(tenant: TenantRepository, customerId: string): Promise<void> {
    await this.assertExists(customerId);
    await this.repo.softDelete(customerId);
    await tenant.audit("customer.delete", "customer", customerId, {});
  }

  /** Merge a duplicate into a survivor. */
  async merge(tenant: TenantRepository, survivorId: string, duplicateId: string): Promise<CustomerDTO> {
    await this.assertExists(survivorId);
    await this.assertExists(duplicateId);
    await this.repo.merge(survivorId, duplicateId);
    await tenant.audit("customer.merge", "customer", survivorId, { duplicateId });
    return this.get(survivorId);
  }

  /** Keyset timeline over the unified stream. */
  async timeline(
    customerId: string,
    limit: number,
    before: string | null
  ): Promise<{ items: TimelineEntryDTO[]; page: PageInfo }> {
    await this.assertExists(customerId);
    // Fetch limit + 1 to detect a further page; the RPC sorts newest-first.
    const rows = await this.repo.timeline(customerId, limit + 1, before);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toTimelineEntryDTO);
    const last = items[items.length - 1];
    return {
      items,
      page: {
        nextCursor: hasMore && last ? last.ts : null, // timeline pages by `before` ts
        hasMore,
        limit,
      },
    };
  }

  private async assertExists(customerId: string): Promise<void> {
    const row = await this.repo.findById(customerId);
    if (!row) throw new NotFoundError("Customer not found");
  }
}
