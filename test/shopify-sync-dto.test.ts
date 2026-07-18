import { describe, it, expect } from "vitest";
import {
  toConnectionHealthDTO,
  toResourceSyncStateDTO,
  toSyncJobDTO,
  type ConnectionHealthRow,
  type ResourceSyncStateRow,
  type SyncJobRow,
} from "@/server/modules/shopify/sync/dto";
import { SYNC_RESOURCES } from "@/lib/shopify/types";

/**
 * Sync-engine DTO mappers + trigger resource-selection.
 *
 * The mappers are the wire boundary between the SECURITY DEFINER read-model RPCs
 * and the merchant dashboard. They must: coerce string/number/null numerics to
 * clean numbers, preserve nulls (never invent a 0 timestamp), and never surface
 * a column the RPC didn't project (no token can leak through a mapper).
 */

describe("shopify sync — connection health mapper", () => {
  it("maps snake_case rows to camelCase and coerces webhook throughput", () => {
    const row: ConnectionHealthRow = {
      connected: true,
      shop_domain: "acme.myshopify.com",
      status: "active",
      installed_at: "2026-07-01T00:00:00.000Z",
      webhooks_24h: { processed: "40" as unknown as number, failed: "2" as unknown as number, total: "42" as unknown as number },
      active_job: { resource: "orders", status: "running", processed: "15" as unknown as number, total: 100 },
      last_error: null,
    };
    const dto = toConnectionHealthDTO(row);
    expect(dto.connected).toBe(true);
    expect(dto.shopDomain).toBe("acme.myshopify.com");
    expect(dto.installedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(dto.webhooks24h).toEqual({ processed: 40, failed: 2, total: 42 });
    expect(dto.activeJob).toEqual({ resource: "orders", status: "running", processed: 15, total: 100 });
  });

  it("defaults a null webhook window to zeros and keeps a null active job", () => {
    const row: ConnectionHealthRow = {
      connected: false,
      shop_domain: null,
      status: null,
      installed_at: null,
      webhooks_24h: null,
      active_job: null,
      last_error: null,
    };
    const dto = toConnectionHealthDTO(row);
    expect(dto.connected).toBe(false);
    expect(dto.webhooks24h).toEqual({ processed: 0, failed: 0, total: 0 });
    expect(dto.activeJob).toBeNull();
    expect(dto.shopDomain).toBeNull();
  });

  it("preserves a null active-job total instead of coercing it to 0", () => {
    const row: ConnectionHealthRow = {
      connected: true,
      shop_domain: "s.myshopify.com",
      status: "active",
      installed_at: null,
      webhooks_24h: { processed: 0, failed: 0, total: 0 },
      active_job: { resource: "products", status: "running", processed: 3, total: null },
      last_error: null,
    };
    const dto = toConnectionHealthDTO(row);
    expect(dto.activeJob?.total).toBeNull();
    expect(dto.activeJob?.processed).toBe(3);
  });
});

describe("shopify sync — resource state mapper", () => {
  it("coerces total_synced from string|null and preserves nullable timestamps", () => {
    const row: ResourceSyncStateRow = {
      resource: "customers",
      last_synced_at: "2026-07-18T10:00:00.000Z",
      last_status: "completed",
      next_sync_at: null,
      total_synced: "1234",
      updated_at: "2026-07-18T10:00:05.000Z",
    };
    const dto = toResourceSyncStateDTO(row);
    expect(dto.totalSynced).toBe(1234);
    expect(dto.lastSyncedAt).toBe("2026-07-18T10:00:00.000Z");
    expect(dto.nextSyncAt).toBeNull();
  });

  it("treats a null total_synced as 0", () => {
    const dto = toResourceSyncStateDTO({
      resource: "inventory",
      last_synced_at: null,
      last_status: null,
      next_sync_at: null,
      total_synced: null,
      updated_at: null,
    });
    expect(dto.totalSynced).toBe(0);
    expect(dto.lastStatus).toBeNull();
  });
});

describe("shopify sync — job mapper", () => {
  it("maps a completed job with duration and coerced numerics", () => {
    const row: SyncJobRow = {
      id: "job-1",
      resource: "orders",
      mode: "manual",
      status: "completed",
      processed: "500",
      total: "500",
      failed: "0",
      attempts: "1",
      error: null,
      triggered_by: "merchant",
      started_at: "2026-07-18T09:00:00.000Z",
      finished_at: "2026-07-18T09:00:12.000Z",
      duration_ms: "12000",
      created_at: "2026-07-18T08:59:59.000Z",
    };
    const dto = toSyncJobDTO(row);
    expect(dto).toMatchObject({
      id: "job-1",
      resource: "orders",
      mode: "manual",
      status: "completed",
      processed: 500,
      total: 500,
      failed: 0,
      attempts: 1,
      triggeredBy: "merchant",
      durationMs: 12000,
    });
  });

  it("keeps a null total/duration for an in-flight job", () => {
    const dto = toSyncJobDTO({
      id: "job-2",
      resource: "products",
      mode: "incremental",
      status: "running",
      processed: 10,
      total: null,
      failed: 0,
      attempts: 1,
      error: null,
      triggered_by: "system",
      started_at: "2026-07-18T09:00:00.000Z",
      finished_at: null,
      duration_ms: null,
      created_at: "2026-07-18T09:00:00.000Z",
    });
    expect(dto.total).toBeNull();
    expect(dto.durationMs).toBeNull();
    expect(dto.finishedAt).toBeNull();
  });
});

/**
 * The trigger's resource selection (mirrors ShopifySyncService.trigger): a
 * named subset must be de-duped and returned in canonical SYNC_RESOURCES order,
 * and unknown resources must be dropped. Kept as a pure function test so it
 * doesn't require standing up the Service/Repository/RPC stack.
 */
function selectTargets(resources?: string[]): readonly string[] {
  return resources && resources.length
    ? SYNC_RESOURCES.filter((r) => resources.includes(r))
    : SYNC_RESOURCES;
}

describe("shopify sync — trigger target selection", () => {
  it("returns every resource when none are named", () => {
    expect(selectTargets()).toEqual([...SYNC_RESOURCES]);
    expect(selectTargets([])).toEqual([...SYNC_RESOURCES]);
  });

  it("de-dupes and canonicalizes a named subset regardless of input order", () => {
    expect(selectTargets(["orders", "customers", "orders"])).toEqual(["customers", "orders"]);
  });

  it("drops unknown resource names", () => {
    expect(selectTargets(["orders", "not-a-resource"])).toEqual(["orders"]);
  });
});
