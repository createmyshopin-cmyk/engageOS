"use client";

import React from "react";
import { Users, Ticket, CheckCircle2, TrendingUp, Sparkles } from "lucide-react";

/**
 * Premium mobile dashboard mockup representing the merchant portal.
 * Features rounded cards, soft gradients, customer analytics, and notifications.
 */
export function PhoneMock() {
  return (
    <div
      aria-hidden
      className="mx-auto w-[290px] h-[580px] rounded-[2.5rem] border-[11px] border-neutral-900 bg-neutral-950 p-2.5 shadow-2xl relative select-none"
      style={{
        boxShadow: "0 25px 50px -12px rgba(124, 58, 237, 0.25), inset 0 1px 0 0 rgba(255,255,255,0.1)"
      }}
    >
      {/* Speaker and Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-32 bg-neutral-900 rounded-b-2xl z-20 flex items-center justify-center">
        <div className="h-1 w-12 bg-neutral-800 rounded-full" />
      </div>

      {/* Screen Container */}
      <div className="w-full h-full rounded-[1.8rem] overflow-hidden bg-neutral-50 relative flex flex-col pt-5">
        
        {/* Mock App Header */}
        <div className="px-4 py-3 bg-white border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h4 className="text-[11px] font-extrabold text-neutral-900 tracking-tight">Ammu Textiles</h4>
            <p className="text-[8px] text-neutral-400 font-semibold uppercase tracking-wider">Campaign Report</p>
          </div>
          <span className="text-[8px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-0.5">
            <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" /> Live
          </span>
        </div>

        {/* Mock Content */}
        <div className="flex-1 p-3.5 space-y-3 overflow-y-auto">
          
          {/* Hero statistics card */}
          <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-3.5 text-white shadow-md relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl" />
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-bold text-violet-150 uppercase tracking-widest">Total Customers Saved</p>
              <Users className="h-3.5 w-3.5 text-violet-200" />
            </div>
            <p className="text-2xl font-black mt-1.5 tracking-tight">1,240</p>
            <p className="text-[8px] font-semibold text-emerald-300 mt-1 flex items-center gap-0.5">
              <TrendingUp className="h-2 w-2" /> +148 new customer numbers this week
            </p>
          </div>

          {/* Quick counters grid */}
          <div className="grid grid-cols-3 gap-2">
            {[
              ["1,812", "Scans", "text-neutral-900"],
              ["93.4%", "Opt-in", "text-violet-600"],
              ["284", "Redeemed", "text-fuchsia-600"],
            ].map(([v, l, c]) => (
              <div key={l} className="rounded-xl bg-white p-2 text-center border border-neutral-100 shadow-sm">
                <p className={`text-xs font-black tracking-tight ${c}`}>{v}</p>
                <p className="text-[7.5px] text-neutral-400 font-extrabold uppercase mt-0.5">{l}</p>
              </div>
            ))}
          </div>

          {/* Mini Chart Mockup */}
          <div className="rounded-xl bg-white p-2.5 border border-neutral-100 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[8.5px] font-extrabold text-neutral-500 uppercase tracking-wider">Weekly Conversion</p>
              <span className="text-[8px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded">A+ Score</span>
            </div>
            {/* Small Sparkline */}
            <div className="h-10 w-full flex items-end">
              <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
                <path d="M 0 30 L 10 25 L 25 28 L 45 15 L 60 12 L 80 5 L 100 2 L 100 30 Z" fill="rgba(124, 58, 237, 0.05)" />
                <path d="M 0 25 L 10 25 L 25 28 L 45 15 L 60 12 L 80 5 L 100 2" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
                <circle cx="100" cy="2" r="2" fill="#7C3AED" />
              </svg>
            </div>
          </div>

          {/* Campaign details */}
          <div className="rounded-xl bg-white p-2.5 border border-neutral-100 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-extrabold text-neutral-800 tracking-tight">Onam Scratch &amp; Win</p>
              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[7px] font-extrabold text-emerald-600 border border-emerald-100 uppercase">
                active
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[7.5px] text-neutral-400 font-semibold">
                <span>Campaign Progress</span>
                <span className="text-neutral-700">638 / 1000 claims</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full w-3/5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full" />
              </div>
            </div>
          </div>

          {/* Recent Players / Notifications */}
          <div className="space-y-1.5">
            <p className="text-[8px] font-extrabold text-neutral-400 uppercase tracking-widest px-1">Live Notifications</p>
            {[
              ["Anjali Menon", "claimed 15% off", "+91 94··· ··12"],
              ["Rahul Krishna", "claimed free gift", "+91 98··· ··55"],
              ["Dr. Sandeep", "scanned QR code", "+91 90··· ··89"],
            ].map(([n, act, p], idx) => (
              <div
                key={n}
                className="flex items-center justify-between rounded-xl bg-white px-2.5 py-2 border border-neutral-100 shadow-sm hover:-translate-y-0.5 transition-transform"
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-4.5 w-4.5 rounded-full bg-violet-50 text-[8px] font-bold text-violet-600 flex items-center justify-center">
                    {n.charAt(0)}
                  </span>
                  <div>
                    <p className="text-[8.5px] font-extrabold text-neutral-800 leading-tight">{n}</p>
                    <p className="text-[7.5px] text-neutral-400 leading-tight">{act}</p>
                  </div>
                </div>
                <span className="text-[8px] tabular-nums text-neutral-400 font-mono">{p}</span>
              </div>
            ))}
          </div>

        </div>

        {/* Home indicator */}
        <div className="py-2.5 bg-white flex justify-center border-t border-neutral-100">
          <div className="h-1 w-24 bg-neutral-300 rounded-full" />
        </div>
      </div>
    </div>
  );
}
