"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { PointsTransactionDTO } from "@/lib/api/types";
import { loyaltyKeys } from "@/lib/api/hooks/use-loyalty-overview";

export function usePointsHistory(
  customerId: string | null,
  opts?: { limit?: number; offset?: number }
) {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  return useQuery({
    queryKey: [...loyaltyKeys.all, "history", customerId ?? "", limit, offset] as const,
    enabled: customerId != null,
    queryFn: ({ signal }) =>
      apiClient.get<PointsTransactionDTO[]>(
        `/api/v1/loyalty/wallet/${customerId}/history?limit=${limit}&offset=${offset}`,
        signal
      ),
    select: (r) => r.data,
  });
}

export function useAdjustPoints(customerId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (body: { delta: number; note?: string }) => {
      const res = await apiClient.post<PointsTransactionDTO | null>(
        `/api/v1/loyalty/wallet/${customerId}/adjust`,
        body
      );
      return res.data;
    },
    onSuccess: () => {
      if (!customerId) return;
      void qc.invalidateQueries({ queryKey: loyaltyKeys.overview() });
      void qc.invalidateQueries({ queryKey: [...loyaltyKeys.all, "wallet", customerId] });
      void qc.invalidateQueries({ queryKey: [...loyaltyKeys.all, "history", customerId] });
    },
  });
}
