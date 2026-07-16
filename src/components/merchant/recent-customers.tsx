import React from "react";
import { FileSpreadsheet } from "lucide-react";

interface Customer {
  id: string;
  phone: string;
  name: string;
  created_at: string;
}

interface RecentCustomersProps {
  customers: Customer[];
  csvUrl: string;
}

function maskPhone(phone: string): string {
  if (phone.length <= 6) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) {
    return `+91 ${digits.slice(-10, -7)}·····${digits.slice(-2)}`;
  }
  return `${phone.slice(0, 4)}·····${phone.slice(-2)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "Just now";
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-teal-100 text-teal-700",
  "bg-green-100 text-green-700",
  "bg-lime-100 text-lime-700",
];

export function RecentCustomers({ customers, csvUrl }: RecentCustomersProps) {
  const shown = customers.slice(0, 5);

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
        <h3 className="text-sm font-black text-[#111827]">Recent Customers</h3>
        <a
          href={csvUrl}
          download
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#16A34A] hover:text-[#166534] transition-colors"
        >
          <FileSpreadsheet className="size-3.5" />
          View all
        </a>
      </div>

      {shown.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-5">
          <div className="size-12 rounded-2xl bg-[#DCFCE7] flex items-center justify-center mb-3">
            <span className="text-2xl">👥</span>
          </div>
          <p className="text-sm font-bold text-[#111827]">No customers yet</p>
          <p className="text-xs text-[#6B7280] mt-1">
            Place your QR code at the store entrance to start collecting!
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-[#F3F4F6]">
            {shown.map((c, idx) => (
              <div
                key={c.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[#F8FAFC] transition-colors"
              >
                {/* Avatar */}
                <div
                  className={`flex items-center justify-center size-9 rounded-xl text-xs font-black shrink-0 ${
                    AVATAR_COLORS[idx % AVATAR_COLORS.length]
                  }`}
                >
                  {initials(c.name) || "?"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#111827] truncate">
                    {c.name}
                  </p>
                  <p className="text-[10px] text-[#9CA3AF] font-medium">
                    {maskPhone(c.phone)}
                  </p>
                </div>

                {/* Time + badge */}
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-[#9CA3AF]">
                    {timeAgo(c.created_at)}
                  </p>
                  <span className="inline-block mt-0.5 text-[9px] font-black text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                    New
                  </span>
                </div>
              </div>
            ))}
          </div>

          {customers.length > 5 && (
            <div className="px-5 py-3 border-t border-[#F3F4F6]">
              <a
                href={csvUrl}
                download
                className="flex items-center gap-1.5 text-[11px] font-bold text-[#16A34A] hover:text-[#166534] transition-colors"
              >
                View all {customers.length.toLocaleString("en-IN")} customers →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
