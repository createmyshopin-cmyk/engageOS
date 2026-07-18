import "server-only";
import type { TenantRepository } from "@/lib/db/tenant-repository";

/**
 * Base class for module repositories.
 *
 * The repository is the ONLY layer that touches the database. It wraps the
 * existing session-bound `TenantRepository` (which auto-scopes every query to
 * the tenant and never exposes the raw service-role client) and adds
 * domain-specific queries — almost always by calling a SECURITY DEFINER RPC.
 * No business rules live here; a repository translates method calls into
 * data operations and returns rows, nothing more.
 *
 * By funnelling all access through TenantRepository, a repository physically
 * cannot read another tenant's data — the business_id is bound at construction.
 */
export abstract class Repository {
  protected constructor(protected readonly tenant: TenantRepository) {}

  /** The tenant every query in this repository is scoped to. */
  protected get businessId(): string {
    return this.tenant.businessId;
  }

  /**
   * Call a SECURITY DEFINER RPC that returns a set of rows, passing the RPC
   * result straight through. Repositories favour RPCs over raw table access so
   * invariants stay in SQL (the project's established pattern).
   */
  protected async rpcRows<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
    // TenantRepository exposes callRpc for void RPCs; for row-returning RPCs we
    // reach the same underlying scoped client via a thin typed helper.
    return this.tenant.rpcSelect<T>(fn, args);
  }

  /** Call a SECURITY DEFINER RPC that returns a single scalar/object. */
  protected async rpcOne<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
    const rows = await this.tenant.rpcSelect<T>(fn, args);
    return rows.length ? rows[0] : null;
  }
}
