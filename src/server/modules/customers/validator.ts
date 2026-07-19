import { z } from "zod";
import { phoneSchema } from "@/lib/validation";

/**
 * Zod validators for the customers module. These run in the route wrapper
 * BEFORE any controller code, so a service always receives well-typed,
 * bounds-checked input. business_id is never accepted here — it's derived from
 * the authenticated principal, never the client.
 */

export const customerRewardFilter = z.enum([
  "all",
  "has_code",
  "active",
  "redeemed",
  "no_reward",
]);
export type CustomerRewardFilter = z.infer<typeof customerRewardFilter>;

export const customerJoinedFilter = z.enum(["all", "7d", "30d", "90d"]);
export type CustomerJoinedFilter = z.infer<typeof customerJoinedFilter>;

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .optional();

const customerListFilters = {
  search: z.string().trim().max(120).optional(),
  rewardFilter: customerRewardFilter.optional(),
  joined: customerJoinedFilter.optional(),
  joinedFrom: dateOnly,
  joinedTo: dateOnly,
};

/** Query params for GET /customers (list). */
export const listCustomersQuery = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.enum(["created_at"]).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    ...customerListFilters,
  })
  .refine(
    (q) => {
      if (!q.joinedFrom || !q.joinedTo) return true;
      return q.joinedFrom <= q.joinedTo;
    },
    { message: "joinedFrom must be on or before joinedTo", path: ["joinedTo"] }
  );
export type ListCustomersQuery = z.infer<typeof listCustomersQuery>;

export const customerExportFormat = z.enum(["csv", "xlsx"]);
export type CustomerExportFormat = z.infer<typeof customerExportFormat>;

/** Query params for GET /customers/export — same filters, no pagination. */
export const exportCustomersQuery = z
  .object({
    ...customerListFilters,
    format: customerExportFormat.optional(),
  })
  .refine(
    (q) => {
      if (!q.joinedFrom || !q.joinedTo) return true;
      return q.joinedFrom <= q.joinedTo;
    },
    { message: "joinedFrom must be on or before joinedTo", path: ["joinedTo"] }
  );
export type ExportCustomersQuery = z.infer<typeof exportCustomersQuery>;

/** Route param for /customers/[id]. */
export const customerIdParam = z.object({
  id: z.string().uuid("Invalid customer id"),
});
export type CustomerIdParam = z.infer<typeof customerIdParam>;

/** Body for POST /customers (upsert by phone). */
export const upsertCustomerBody = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(160).optional(),
  gender: z.enum(["male", "female", "other", "undisclosed"]).optional(),
  birthday: z.string().date().optional(),
  anniversary: z.string().date().optional(),
  language: z.string().trim().max(10).optional(),
  timezone: z.string().trim().max(40).optional(),
  source: z.string().trim().max(40).optional(),
});
export type UpsertCustomerBody = z.infer<typeof upsertCustomerBody>;

/** Body for POST /customers/[id]/consent. */
export const setConsentBody = z.object({
  channel: z.enum(["whatsapp", "email", "sms", "push"]),
  status: z.enum(["granted", "revoked"]),
  source: z.string().trim().max(40).optional(),
});
export type SetConsentBody = z.infer<typeof setConsentBody>;

/** Body for POST /customers/[id]/tags. */
export const addTagBody = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex code").optional(),
});
export type AddTagBody = z.infer<typeof addTagBody>;

/** Body for POST /customers/merge. */
export const mergeCustomersBody = z.object({
  survivorId: z.string().uuid(),
  duplicateId: z.string().uuid(),
}).refine((v) => v.survivorId !== v.duplicateId, {
  message: "survivorId and duplicateId must differ",
  path: ["duplicateId"],
});
export type MergeCustomersBody = z.infer<typeof mergeCustomersBody>;

/** Query for GET /customers/[id]/timeline. */
export const timelineQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().datetime().optional(),
});
export type TimelineQuery = z.infer<typeof timelineQuery>;
