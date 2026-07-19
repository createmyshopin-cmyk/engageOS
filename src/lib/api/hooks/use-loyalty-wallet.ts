"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { LoyaltyWalletDTO } from "@/lib/api/types";
import { loyaltyKeys } from "@/lib/api/hooks/use-loyalty-overview";

export function useLoyaltyWallet(customerId: string | null) {
  return useQuery({
    queryKey: [...loyaltyKeys.all, "wallet", customerId ?? ""] as const,
    enabled: customerId != null,
    queryFn: ({ signal }) =>
      apiClient.get<LoyaltyWalletDTO>(`/api/v1/loyalty/wallet/${customerId}`, signal),
    select: (r) => r.data,
  });
}
