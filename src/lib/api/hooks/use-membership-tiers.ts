"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { MembershipTierDTO } from "@/lib/api/types";
import { loyaltyKeys } from "@/lib/api/hooks/use-loyalty-overview";

export function useMembershipTiers() {
  return useQuery({
    queryKey: [...loyaltyKeys.all, "tiers"] as const,
    queryFn: ({ signal }) =>
      apiClient.get<MembershipTierDTO[]>("/api/v1/loyalty/tiers", signal),
    select: (r) => r.data,
  });
}

export function useUpdateMembershipTiers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tiers: MembershipTierDTO[]) => {
      const res = await apiClient.put<MembershipTierDTO[]>("/api/v1/loyalty/tiers", {
        tiers: tiers.map((t) => ({
          slug: t.slug,
          name: t.name,
          minPoints: t.minPoints,
          maxPoints: t.maxPoints,
          color: t.color,
          icon: t.icon,
          bonusMultiplier: t.bonusMultiplier,
          benefits: t.benefits,
        })),
      });
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...loyaltyKeys.all, "tiers"] });
      void qc.invalidateQueries({ queryKey: loyaltyKeys.overview() });
    },
  });
}
