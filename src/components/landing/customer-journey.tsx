"use client";

import React, { useState, useEffect } from "react";
import { Store, QrCode, UserCheck, Gift, MessageSquare, RotateCcw, ArrowRight } from "lucide-react";

export function CustomerJourney() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 6);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  const steps = [
    {
      title: "1. Merchant Setup",
      subtitle: "Standee placed at checkout",
      icon: Store,
      desc: "Merchant displays a customized QR Code Scratch standee at the cash counter.",
      color: "border-violet-200 bg-violet-50 text-violet-600 shadow-violet-100",
      activeColor: "ring-2 ring-violet-500 bg-violet-600 text-white shadow-violet-300 scale-105"
    },
    {
      title: "2. Scan QR Code",
      subtitle: "Customer scans with camera",
      icon: QrCode,
      desc: "Shoppers scan with their phone. Opens a web page instantly—no app download required.",
      color: "border-indigo-200 bg-indigo-50 text-indigo-600 shadow-indigo-100",
      activeColor: "ring-2 ring-indigo-500 bg-indigo-600 text-white shadow-indigo-300 scale-105"
    },
    {
      title: "3. Interactive Play",
      subtitle: "Instant gamified scratch card",
      icon: UserCheck,
      desc: "Customer scratches the card right on their screen to reveal a festival discount prize.",
      color: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-600 shadow-fuchsia-100",
      activeColor: "ring-2 ring-fuchsia-500 bg-fuchsia-600 text-white shadow-fuchsia-300 scale-105"
    },
    {
      title: "4. Claim Reward",
      subtitle: "Consent + data captured",
      icon: Gift,
      desc: "Shopper types their Name and WhatsApp number to claim the scratch card reward.",
      color: "border-pink-200 bg-pink-50 text-pink-600 shadow-pink-100",
      activeColor: "ring-2 ring-pink-500 bg-pink-600 text-white shadow-pink-300 scale-105"
    },
    {
      title: "5. WhatsApp Voucher",
      subtitle: "Sent straight to chat",
      icon: MessageSquare,
      desc: "The digital coupon is immediately delivered to their WhatsApp with redemption details.",
      color: "border-emerald-200 bg-emerald-50 text-emerald-600 shadow-emerald-100",
      activeColor: "ring-2 ring-emerald-500 bg-emerald-600 text-white shadow-emerald-300 scale-105"
    },
    {
      title: "6. Repeat Purchase",
      subtitle: "Voucher redeemed at billing",
      icon: RotateCcw,
      desc: "Shopper returns to your store to redeem the discount. The loop starts again!",
      color: "border-amber-200 bg-amber-50 text-amber-600 shadow-amber-100",
      activeColor: "ring-2 ring-amber-500 bg-amber-600 text-white shadow-amber-300 scale-105"
    }
  ];

  return (
    <div className="w-full">
      {/* Visual Flywheel Step Selector */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isActive = idx === activeStep;

          return (
            <div
              key={step.title}
              onClick={() => setActiveStep(idx)}
              className={`rounded-2xl border p-5 shadow-sm transition-all duration-500 flex flex-col justify-between items-center text-center cursor-pointer relative h-[210px] ${
                isActive 
                  ? "bg-white border-violet-400 scale-[1.03] shadow-lg shadow-violet-100/50" 
                  : "bg-white/50 border-neutral-100 hover:border-neutral-200"
              }`}
            >
              {/* Badge Icon */}
              <span className={`h-11 w-11 rounded-xl flex items-center justify-center border transition-all duration-500 ${
                isActive ? step.activeColor : step.color
              }`}>
                <Icon className="h-5 w-5" />
              </span>

              {/* Text content */}
              <div className="mt-3.5 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className={`text-xs font-black tracking-tight transition-colors duration-500 ${
                    isActive ? "text-violet-600" : "text-neutral-900"
                  }`}>
                    {step.title}
                  </h4>
                  <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider mt-0.5 leading-tight">
                    {step.subtitle}
                  </p>
                </div>
                <p className="text-[10px] text-neutral-500 font-medium leading-relaxed mt-2.5">
                  {step.desc}
                </p>
              </div>

              {/* Connecting arrows visible on desktop */}
              {idx < 5 && (
                <div className={`absolute right-[-14px] top-1/2 -translate-y-1/2 hidden lg:block z-10 transition-colors duration-500 ${
                  isActive ? "text-violet-500 animate-pulse" : "text-neutral-200"
                }`}>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Flywheel Loop Path Indicator Bar */}
      <div className="mt-8 flex justify-center items-center gap-1">
        {steps.map((_, idx) => (
          <span
            key={idx}
            onClick={() => setActiveStep(idx)}
            className={`h-1.5 rounded-full transition-all duration-500 cursor-pointer ${
              idx === activeStep ? "w-8 bg-violet-600" : "w-2 bg-neutral-200 hover:bg-neutral-300"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
