"use client";

import React, { useState } from "react";
import { Users, Ticket, Activity, TrendingUp, Sparkles, Plus, CheckCircle, BarChart3 } from "lucide-react";

export function InteractiveDashboard() {
  const [activeTab, setActiveTab] = useState<"overview" | "live" | "campaigns">("overview");

  // Mock data representing realistic retail shop metrics (e.g. Ammu Textiles, Kochi)
  const stats = [
    { label: "Today's Customers", value: "32", change: "+14% vs last week", icon: Users, color: "text-violet-600 bg-violet-50 border-violet-100" },
    { label: "Coupons Redeemed", value: "18", change: "56.2% redeem rate", icon: Ticket, color: "text-fuchsia-600 bg-fuchsia-50 border-fuchsia-100" },
    { label: "New WhatsApp Opt-ins", value: "30", change: "93.7% consent rate", icon: Activity, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
  ];

  const recentPlayers = [
    { name: "Anjali Menon", phone: "+91 9447••••12", prize: "15% Off Coupon", status: "Redeemed", time: "2 mins ago" },
    { name: "Rahul Krishna", phone: "+91 9846••••55", prize: "Free Gift Coupon", status: "Won Card", time: "12 mins ago" },
    { name: "Dr. Sandeep", phone: "+91 9072••••89", prize: "10% Off Coupon", status: "Scanned QR", time: "24 mins ago" },
    { name: "Fathima N.", phone: "+91 7012••••44", prize: "Free Drink Coupon", status: "Redeemed", time: "1 hour ago" },
    { name: "Manoj Varghese", phone: "+91 8547••••01", prize: "₹500 Gift Voucher", status: "Won Card", time: "2 hours ago" },
  ];

  const campaigns = [
    { name: "Onam Festival scratch card", type: "Scratch & Win", status: "Active", scans: "682", optIns: "638", redemptions: "124" },
    { name: "Sunday special lucky draw", type: "Lucky Draw", status: "Scheduled", scans: "0", optIns: "0", redemptions: "0" },
    { name: "Monsoon clear-out voucher", type: "Digital Coupon", status: "Ended", scans: "412", optIns: "386", redemptions: "215" },
  ];

  return (
    <div className="w-full rounded-3xl border border-neutral-100 bg-white p-6 shadow-xl shadow-neutral-100/70 select-none">
      
      {/* Dashboard Header */}
      <div className="flex flex-col gap-4 border-b border-neutral-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-neutral-900 tracking-tight">Ammu Textiles, Kochi</h3>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-100 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live updates
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">EngageOS Merchant Panel</p>
        </div>

        {/* Tab Controls */}
        <div className="flex rounded-xl bg-neutral-100 p-1 self-start sm:self-center">
          {(["overview", "live", "campaigns"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === tab
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Contents */}
      <div className="pt-6 min-h-[300px]">
        
        {activeTab === "overview" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-neutral-500">{stat.label}</p>
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border ${stat.color}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-black text-neutral-950 tracking-tight">{stat.value}</p>
                    <p className="mt-1 text-[10px] font-medium text-emerald-600">{stat.change}</p>
                  </div>
                );
              })}
            </div>

            {/* Visual Charts & Health Score Row */}
            <div className="grid gap-4 md:grid-cols-5">
              
              {/* Business Health Score Widget */}
              <div className="rounded-2xl border border-neutral-100 bg-gradient-to-b from-white to-neutral-50 p-4 shadow-sm md:col-span-2 flex flex-col items-center justify-center text-center">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Store Health Score</p>
                <div className="relative flex items-center justify-center h-28 w-28">
                  {/* Outer circle */}
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="56" cy="56" r="46" stroke="#f3f4f6" strokeWidth="8" fill="transparent" />
                    <circle 
                      cx="56" 
                      cy="56" 
                      r="46" 
                      stroke="url(#purpleGradient)" 
                      strokeWidth="8" 
                      fill="transparent" 
                      strokeDasharray="289" 
                      strokeDashoffset="37" // 87% progress
                      strokeLinecap="round"
                    />
                    <defs>
                      <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#7C3AED" />
                        <stop offset="100%" stopColor="#EC4899" />
                      </linearGradient>
                    </defs>
                  </svg>
                  {/* Inside Circle Score */}
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-neutral-950">A+</span>
                    <span className="text-[9px] font-bold text-violet-600 mt-0.5">87% SCORE</span>
                  </div>
                </div>
                <p className="text-[10px] text-neutral-500 mt-3 max-w-[180px] leading-relaxed">
                  Excellent! <span className="font-semibold text-neutral-700">93% opt-in rate</span> and fast staff redemption.
                </p>
              </div>

              {/* Customer Growth Graph Mockup */}
              <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm md:col-span-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-neutral-700">Customer Database Growth</p>
                    <span className="text-[10px] text-neutral-400 font-semibold flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-emerald-500" /> +168 this week
                    </span>
                  </div>
                  <p className="text-[10px] text-neutral-400">Past 6 days activity</p>
                </div>
                
                {/* SVG Graph representation */}
                <div className="h-28 w-full mt-4 flex items-end">
                  <svg className="w-full h-full" viewBox="0 0 300 100" preserveAspectRatio="none">
                    {/* Grid Lines */}
                    <line x1="0" y1="20" x2="300" y2="20" stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4" />
                    <line x1="0" y1="50" x2="300" y2="50" stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4" />
                    <line x1="0" y1="80" x2="300" y2="80" stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4" />
                    
                    {/* Area fill under curve */}
                    <path 
                      d="M 0 100 L 10 90 L 60 75 L 110 82 L 160 55 L 210 40 L 260 25 L 300 12 L 300 100 Z" 
                      fill="url(#areaGradient)" 
                    />
                    {/* Main Line */}
                    <path 
                      d="M 0 90 L 10 90 L 60 75 L 110 82 L 160 55 L 210 40 L 260 25 L 300 12" 
                      fill="none" 
                      stroke="#7C3AED" 
                      strokeWidth="3.5" 
                      strokeLinecap="round"
                    />

                    {/* Gradient under curve */}
                    <defs>
                      <linearGradient id="areaGradient" x1="0" y1="0%" x2="0" y2="100%">
                        <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Dots at keys */}
                    <circle cx="260" cy="25" r="4" fill="#ffffff" stroke="#7C3AED" strokeWidth="2" />
                    <circle cx="300" cy="12" r="4" fill="#ffffff" stroke="#7C3AED" strokeWidth="2" />
                  </svg>
                </div>

                {/* Day Labels */}
                <div className="flex justify-between text-[9px] font-bold text-neutral-400 px-1 pt-2">
                  <span>MON</span>
                  <span>TUE</span>
                  <span>WED</span>
                  <span>THU</span>
                  <span>FRI</span>
                  <span>SAT</span>
                  <span>SUN</span>
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === "live" && (
          <div className="space-y-4 animate-fadeIn">
            <p className="text-xs text-neutral-500 mb-2">Live log of scanning and reward redemptions at your checkout counters.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-100 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    <th className="pb-3 font-semibold">Customer</th>
                    <th className="pb-3 font-semibold">Phone</th>
                    <th className="pb-3 font-semibold">Prize Won</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50 text-xs">
                  {recentPlayers.map((player) => (
                    <tr key={player.phone} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="py-3.5 font-bold text-neutral-800">{player.name}</td>
                      <td className="py-3.5 text-neutral-500 font-mono tracking-tight">{player.phone}</td>
                      <td className="py-3.5 text-neutral-600 font-medium">{player.prize}</td>
                      <td className="py-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                          player.status === "Redeemed"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : player.status === "Won Card"
                            ? "bg-violet-50 text-violet-700 border-violet-100"
                            : "bg-amber-50 text-amber-700 border-amber-100"
                        }`}>
                          {player.status}
                        </span>
                      </td>
                      <td className="py-3.5 text-neutral-400 text-right font-medium">{player.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "campaigns" && (
          <div className="space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <p className="text-xs text-neutral-500">Run multiple customer loyalty programs simultaneously.</p>
              <button className="rounded-xl bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-[10px] font-bold text-white shadow-sm transition-colors flex items-center gap-1 cursor-pointer">
                <Plus className="h-3.5 w-3.5" /> Launch Campaign
              </button>
            </div>

            <div className="space-y-3">
              {campaigns.map((camp) => (
                <div key={camp.name} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-neutral-800 leading-tight">{camp.name}</h4>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                        camp.status === "Active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : camp.status === "Scheduled"
                          ? "bg-violet-50 text-violet-700 border-violet-100"
                          : "bg-neutral-100 text-neutral-600 border-neutral-200"
                      }`}>
                        {camp.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-1 uppercase font-bold tracking-wider">{camp.type}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-6 text-center sm:text-left">
                    <div>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase">Scans</p>
                      <p className="text-sm font-bold text-neutral-800 mt-0.5">{camp.scans}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase">Opt-Ins</p>
                      <p className="text-sm font-bold text-neutral-800 mt-0.5">{camp.optIns}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-neutral-400 font-bold uppercase">Redeemed</p>
                      <p className="text-sm font-bold text-neutral-800 mt-0.5">{camp.redemptions}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
