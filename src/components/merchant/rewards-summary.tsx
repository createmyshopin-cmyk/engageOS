import React from "react";
import { Gift } from "lucide-react";

interface Reward {
  name: string;
  total: number;
  remaining: number;
}

interface RewardsSummaryProps {
  rewards: Reward[];
}

const REWARD_EMOJIS: Record<string, string> = {
  default: "🎁",
  "5%": "🏷️",
  "10%": "🎫",
  gift: "🎀",
  grand: "🏆",
  voucher: "💳",
};

function getEmoji(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, emoji] of Object.entries(REWARD_EMOJIS)) {
    if (lower.includes(key)) return emoji;
  }
  return REWARD_EMOJIS.default;
}

export function RewardsSummary({ rewards }: RewardsSummaryProps) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
        <h3 className="text-sm font-black text-[#111827]">Rewards Summary</h3>
        <div className="size-7 rounded-lg bg-[#DCFCE7] flex items-center justify-center">
          <Gift className="size-4 text-[#16A34A]" />
        </div>
      </div>

      {rewards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center px-5">
          <p className="text-sm font-bold text-[#111827]">No rewards configured</p>
          <p className="text-xs text-[#6B7280] mt-1">
            Rewards will appear here once your campaign is active.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#F3F4F6]">
          {rewards.map((r) => {
            const pct = r.total > 0 ? ((r.remaining / r.total) * 100).toFixed(0) : "0";
            const isCritical = r.remaining <= Math.max(r.total * 0.1, 2);

            return (
              <div key={r.name} className="px-5 py-3.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg leading-none">{getEmoji(r.name)}</span>
                    <span className="text-xs font-bold text-[#111827]">{r.name}</span>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-sm font-black ${
                        isCritical ? "text-[#EF4444]" : "text-[#111827]"
                      }`}
                    >
                      {r.remaining.toLocaleString("en-IN")}
                    </span>
                    <span className="text-[9px] text-[#9CA3AF] block font-medium">
                      Remaining
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 rounded-full bg-[#F3F4F6] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isCritical ? "bg-[#EF4444]" : "bg-[#16A34A]"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-[#9CA3AF]">
                    {pct}% remaining
                  </span>
                  {isCritical && (
                    <span className="text-[9px] font-bold text-[#EF4444]">
                      Running low!
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
