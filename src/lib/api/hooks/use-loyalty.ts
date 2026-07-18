"use client";

/**
 * React Query hook for the Loyalty read model (`/api/v1/loyalty/:customerId`).
 *
 * The ONLY sanctioned client data path for a customer's loyalty standing —
 * components never fetch or hit the DB directly. Read-only projection of the
 * precomputed RFM model; tenancy enforced server-side (no business id sent).
 */

import { useQuery } from "@tanstack/react-query";
import { apiClient, type ApiResult } from "@/lib/api/client";
import type { LoyaltyProfileDTO } from "@/lib/api/types";

export const loyaltyKeys = {
  all: ["loyalty"] as const,
  detail: (customerId: string) => [...loyaltyKeys.all, customerId] as const,
};

/** A customer's loyalty/engagement standing. Disabled until a customer is chosen. */
export function useLoyaltyProfile(customerId: string | null) {
  return useQuery({
    queryKey: loyaltyKeys.detail(customerId ?? ""),
    enabled: customerId != null,
    queryFn: ({ signal }) =>
      apiClient.get<LoyaltyProfileDTO>(`/api/v1/loyalty/${customerId}`, signal),
    select: (r: ApiResult<LoyaltyProfileDTO>) => r.data,
  });
}
