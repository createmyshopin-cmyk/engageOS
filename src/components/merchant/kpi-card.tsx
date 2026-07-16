import React from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  trendLabel?: string;
  highlight?: boolean;
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  trendUp = true,
  trendLabel,
  highlight = false,
}: KpiCardProps) {
  return (
    <div
      className={`
        group relative overflow-hidden rounded-2xl border p-5
        transition-all duration-200 hover:shadow-md hover:-translate-y-0.5
        ${
          highlight
            ? "bg-[#16A34A] border-[#166534]/40 shadow-lg shadow-green-500/20"
            : "bg-white border-[#E5E7EB] shadow-sm"
        }
      `}
    >
      {/* Top row */}
      <div className="flex items-center justify-between">
        <span
          className={`text-[10px] font-bold uppercase tracking-widest ${
            highlight ? "text-white/70" : "text-[#6B7280]"
          }`}
        >
          {label}
        </span>
        <div
          className={`flex items-center justify-center size-9 rounded-xl transition-transform duration-200 group-hover:scale-110 ${
            highlight ? "bg-white/15" : "bg-[#DCFCE7]"
          }`}
        >
          <Icon
            className={`size-4.5 ${highlight ? "text-white" : "text-[#16A34A]"}`}
          />
        </div>
      </div>

      {/* Value */}
      <p
        className={`mt-4 text-4xl font-black leading-none tracking-tight ${
          highlight ? "text-white" : "text-[#111827]"
        }`}
      >
        {value}
      </p>

      {/* Trend */}
      {trend && (
        <div className="mt-3 flex items-center gap-1">
          {trendUp ? (
            <TrendingUp
              className={`size-3.5 ${highlight ? "text-white/80" : "text-[#16A34A]"}`}
            />
          ) : (
            <TrendingDown
              className={`size-3.5 ${highlight ? "text-white/80" : "text-[#EF4444]"}`}
            />
          )}
          <span
            className={`text-[10px] font-bold ${
              highlight
                ? "text-white/80"
                : trendUp
                ? "text-[#16A34A]"
                : "text-[#EF4444]"
            }`}
          >
            {trend}
          </span>
          {trendLabel && (
            <span
              className={`text-[10px] font-medium ${
                highlight ? "text-white/50" : "text-[#9CA3AF]"
              }`}
            >
              {trendLabel}
            </span>
          )}
        </div>
      )}

      {/* Subtle glow for highlight card */}
      {highlight && (
        <div className="absolute -right-4 -bottom-4 size-24 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      )}
    </div>
  );
}
