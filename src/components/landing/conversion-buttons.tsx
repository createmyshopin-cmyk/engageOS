"use client";

import React, { useState } from "react";
import { BookingModal } from "./booking-modal";
import { MessageSquare, Calendar, ChevronRight } from "lucide-react";

interface ConversionButtonsProps {
  variant?: "hero" | "nav" | "pricing" | "footer" | "sticky";
  className?: string;
}

export function ConversionButtons({ variant = "hero", className = "" }: ConversionButtonsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const waNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919074744747").replace(/[^\d]/g, "");
  
  const getWaHref = (customText?: string) => {
    const text = encodeURIComponent(
      customText || "Hi! I saw the EngageOS landing page. I want to know more about running a WhatsApp campaign for my store."
    );
    return `https://wa.me/${waNumber}?text=${text}`;
  };

  const handleOpenModal = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsModalOpen(true);
  };

  if (variant === "nav") {
    return (
      <>
        <button
          onClick={handleOpenModal}
          className="rounded-full bg-neutral-900 hover:bg-neutral-800 text-white px-5 py-2.5 text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
        >
          Book Free Demo
        </button>
        <BookingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  if (variant === "pricing") {
    return (
      <>
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleOpenModal}
            className="w-full rounded-2xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 py-4 text-center text-sm font-bold text-white shadow-lg shadow-violet-600/25 transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            Book Your Onam Campaign (₹4,999)
          </button>
          <a
            href={getWaHref("Hi, I want to book the ₹4,999 Onam Package for my shop. Please contact me.")}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-2xl border border-neutral-200 bg-white hover:border-neutral-300 py-4 text-center text-sm font-bold text-neutral-800 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageSquare className="h-4 w-4 text-emerald-500 fill-emerald-500" />
            Chat with a Campaign Expert
          </a>
        </div>
        <BookingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  if (variant === "footer") {
    return (
      <>
        <div className={`flex flex-col sm:flex-row gap-3 justify-center ${className}`}>
          <button
            onClick={handleOpenModal}
            className="rounded-2xl bg-white hover:bg-neutral-50 text-neutral-950 px-8 py-4 text-sm font-bold transition-all hover:-translate-y-0.5 cursor-pointer shadow-lg"
          >
            Book a Free Demo
          </button>
          <a
            href={getWaHref("Hi EngageOS, I want to get a free demo of the WhatsApp platform.")}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl border border-neutral-700 bg-neutral-950 hover:bg-neutral-900 px-8 py-4 text-sm font-bold text-white transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageSquare className="h-4 w-4 text-emerald-400 fill-emerald-400" />
            Chat on WhatsApp
          </a>
        </div>
        <BookingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  if (variant === "sticky") {
    return (
      <>
        <div className="flex gap-2.5 w-full">
          <a
            href={getWaHref()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-2xl bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 py-3 text-center text-xs font-bold text-neutral-800 active:scale-98 transition-all flex items-center justify-center gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5 text-emerald-500 fill-emerald-500" />
            WhatsApp
          </a>
          <button
            onClick={handleOpenModal}
            className="flex-[2] rounded-2xl bg-violet-600 hover:bg-violet-700 py-3 text-center text-xs font-bold text-white active:scale-98 transition-all cursor-pointer shadow-sm"
          >
            Book Free Demo
          </button>
        </div>
        <BookingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  // Default: variant === "hero"
  return (
    <>
      <div className={`flex flex-col sm:flex-row gap-3 ${className}`}>
        <button
          onClick={handleOpenModal}
          className="rounded-2xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white px-8 py-4 text-sm font-bold transition-all hover:-translate-y-0.5 cursor-pointer shadow-lg shadow-violet-600/25 flex items-center justify-center gap-1.5"
        >
          <Calendar className="h-4 w-4" /> Book Free Demo
        </button>
        <a
          href={getWaHref()}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-2xl border border-neutral-200 bg-white hover:border-neutral-300 text-neutral-800 px-8 py-4 text-sm font-bold transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
        >
          <MessageSquare className="h-4 w-4 text-emerald-500 fill-emerald-500" />
          Chat on WhatsApp
        </a>
      </div>
      <BookingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
