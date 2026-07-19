"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { PointsRuleDTO } from "@/lib/api/types";
import { loyaltyKeys } from "@/lib/api/hooks/use-loyalty-overview";

export function useLoyaltyRules() {
  return useQuery({
    queryKey: [...loyaltyKeys.all, "rules"] as const,
    queryFn: ({ signal }) =>
      apiClient.get<PointsRuleDTO[]>("/api/v1/loyalty/rules", signal),
    select: (r) => r.data,
  });
}

export function useUpdateLoyaltyRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rules: PointsRuleDTO[]) => {
      const res = await apiClient.put<PointsRuleDTO[]>("/api/v1/loyalty/rules", {
        rules: rules.map((r) => ({
          ruleType: r.ruleType,
          pointsPerUnit: r.pointsPerUnit,
          fixedPoints: r.fixedPoints,
          multiplier: r.multiplier,
          active: r.active,
        })),
      });
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...loyaltyKeys.all, "rules"] });
    },
  });
}
