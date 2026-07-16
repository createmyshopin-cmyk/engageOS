import React from "react";
import { Users, MessageSquare, ArrowRight } from "lucide-react";

interface HeroCardProps {
  businessName: string;
  totalCustomers: number;
  monthCustomers: number;
  dashboardUrl: string;
  whatsappPhone?: string;
}

export function HeroCard({
  businessName,
  totalCustomers,
  monthCustomers,
  whatsappPhone,
}: HeroCardProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-[#16A34A] p-6 lg:p-8 shadow-xl shadow-green-500/20">
      {/* Background decoration */}
      <div className="absolute -right-8 -top-8 size-48 rounded-full bg-white/8 blur-2xl pointer-events-none" />
      <div className="absolute right-12 bottom-0 size-32 rounded-full bg-[#166534]/60 blur-3xl pointer-events-none" />
      <div className="absolute -left-4 -bottom-4 size-32 rounded-full bg-black/10 blur-2xl pointer-events-none" />

      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Left: text */}
        <div className="flex-1 min-w-0">
          {/* Icon row */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center justify-center size-9 rounded-xl bg-white/15 backdrop-blur-sm">
              <Users className="size-4.5 text-white" />
            </div>
            <span className="text-[11px] font-black text-white/70 uppercase tracking-widest">
              Customer Update
            </span>
          </div>

          <h2 className="text-2xl lg:text-3xl font-black text-white leading-tight">
            🎉 You collected{" "}
            <span className="bg-white/20 rounded-xl px-2 py-0.5 mx-1">
              {monthCustomers.toLocaleString("en-IN")} customers
            </span>{" "}
            this month
          </h2>

          <p className="mt-3 text-sm lg:text-base text-white/70 leading-relaxed max-w-xl">
            These customers now belong to your business.{" "}
            <br className="hidden lg:block" />
            Keep engaging them through WhatsApp and bring them back to your
            store.
          </p>

          {/* CTA buttons */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#16A34A] shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
              <Users className="size-4" />
              View Customers
              <ArrowRight className="size-3.5" />
            </button>

            {whatsappPhone && (
              <a
                href={`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(
                  `Hi ${businessName}! Your EngageOS campaign has ${totalCustomers.toLocaleString("en-IN")} customers. Keep engaging! 🎉`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/25 transition-all"
              >
                <MessageSquare className="size-4" />
                Send WhatsApp
              </a>
            )}
          </div>
        </div>

        {/* Right: stat bubble */}
        <div className="flex flex-row lg:flex-col items-center gap-4 lg:gap-3 shrink-0">
          <div className="text-center bg-white/12 backdrop-blur-sm rounded-2xl border border-white/20 px-6 py-4">
            <p className="text-4xl font-black text-white leading-none">
              {totalCustomers.toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] font-bold text-white/60 mt-1 uppercase tracking-widest">
              Total Customers
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
