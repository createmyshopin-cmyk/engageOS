import React from "react";
import { CheckCircle, AlertCircle } from "lucide-react";

interface HealthItem {
  label: string;
  status: "good" | "warning" | "error";
  detail?: string;
}

interface HealthCardProps {
  items: HealthItem[];
}

export function HealthCard({ items }: HealthCardProps) {
  const allGood = items.every((i) => i.status === "good");

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-black text-[#111827]">Business Health</h3>
        <div
          className={`flex items-center justify-center size-7 rounded-lg ${
            allGood ? "bg-[#DCFCE7]" : "bg-amber-50"
          }`}
        >
          {allGood ? (
            <CheckCircle className="size-4 text-[#16A34A]" />
          ) : (
            <AlertCircle className="size-4 text-amber-500" />
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {items.map(({ label, status, detail }) => (
          <div key={label} className="flex items-center justify-between py-0.5">
            <div className="flex items-center gap-2.5">
              <div
                className={`size-5 rounded-full flex items-center justify-center shrink-0 ${
                  status === "good"
                    ? "bg-[#DCFCE7]"
                    : status === "warning"
                    ? "bg-amber-50"
                    : "bg-red-50"
                }`}
              >
                {status === "good" ? (
                  <svg className="size-3 text-[#16A34A]" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                ) : (
                  <div
                    className={`size-1.5 rounded-full ${
                      status === "warning" ? "bg-amber-400" : "bg-[#EF4444]"
                    }`}
                  />
                )}
              </div>
              <span className="text-xs font-semibold text-[#374151]">{label}</span>
            </div>
            <span
              className={`text-xs font-bold ${
                status === "good"
                  ? "text-[#16A34A]"
                  : status === "warning"
                  ? "text-amber-600"
                  : "text-[#EF4444]"
              }`}
            >
              {detail ?? (status === "good" ? "Good" : status === "warning" ? "Check" : "Error")}
            </span>
          </div>
        ))}
      </div>

      {allGood && (
        <div className="mt-4 rounded-xl bg-[#DCFCE7] border border-[#16A34A]/20 px-3.5 py-2.5">
          <p className="text-xs font-bold text-[#166534] flex items-center gap-1.5">
            <span>✨</span> Everything looks healthy!
          </p>
        </div>
      )}
    </div>
  );
}
