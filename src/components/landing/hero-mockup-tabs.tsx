"use client";

import React, { useState } from "react";
import { CampaignSimulator } from "./campaign-simulator";
import { PhoneMock } from "./phone-mock";
import { Smartphone, BarChart3, Sparkles } from "lucide-react";

export function HeroMockupTabs() {
  const [activeMode, setActiveMode] = useState<"customer" | "merchant">("customer");

  return (
    <div className="w-full flex flex-col items-center">
      {/* Mode Selector Tabs */}
      <div className="flex rounded-full bg-neutral-150 p-1 mb-6 border border-neutral-200/50 shadow-inner z-20">
        <button
          onClick={() => setActiveMode("customer")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeMode === "customer"
              ? "bg-violet-600 text-white shadow-md shadow-violet-600/20"
              : "text-neutral-500 hover:text-neutral-850"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Customer Game</span>
        </button>
        <button
          onClick={() => setActiveMode("merchant")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
            activeMode === "merchant"
              ? "bg-violet-600 text-white shadow-md shadow-violet-600/20"
              : "text-neutral-500 hover:text-neutral-850"
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          <span>Merchant Dashboard</span>
        </button>
      </div>

      {/* Frame Container */}
      <div className="relative w-full flex justify-center items-center min-h-[585px]">
        {activeMode === "customer" ? (
          <div className="animate-fadeIn">
            <CampaignSimulator />
          </div>
        ) : (
          <div className="animate-fadeIn">
            <PhoneMock />
          </div>
        )}

        {/* Ambient glow effects matching the active tab */}
        <div className={`absolute inset-0 w-64 h-64 rounded-full blur-3xl -z-10 transition-colors duration-500 ${
          activeMode === "customer" ? "bg-fuchsia-400/10" : "bg-violet-400/10"
        } left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2`} />
      </div>
    </div>
  );
}
