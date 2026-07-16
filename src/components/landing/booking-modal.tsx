"use client";

import React, { useState, useEffect } from "react";
import { X, CheckCircle2, Loader2, Store, Phone, User, MapPin } from "lucide-react";

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BookingModal({ isOpen, onClose }: BookingModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    shopName: "",
    category: "",
    city: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Lock scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate database write
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);

      // Create WhatsApp message string
      const waNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919074744747").replace(/[^\d]/g, "");
      const text = encodeURIComponent(
        `👋 *New Demo Booking!*\n\n` +
        `👤 *Merchant:* ${formData.name}\n` +
        `📞 *WhatsApp:* ${formData.phone}\n` +
        `🏪 *Store Name:* ${formData.shopName}\n` +
        `🏷️ *Category:* ${formData.category || "Not Specified"}\n` +
        `📍 *Location:* ${formData.city}\n\n` +
        `Please schedule a free demo session for my store.`
      );
      
      const waUrl = `https://wa.me/${waNumber}?text=${text}`;
      
      // Redirect after 1.5 seconds so they see the success animation
      setTimeout(() => {
        window.open(waUrl, "_blank", "noopener,noreferrer");
        onClose();
        setIsSuccess(false);
        setFormData({ name: "", phone: "", shopName: "", category: "", city: "" });
      }, 1500);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-md transform overflow-hidden rounded-3xl bg-white p-6 shadow-2xl transition-all duration-300 ease-out border border-neutral-100 scale-100">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        {!isSuccess ? (
          <div>
            <div className="mb-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 mb-3">
                <Store className="h-5 w-5" />
              </span>
              <h2 className="text-2xl font-extrabold text-neutral-950">Book a Free Live Demo</h2>
              <p className="mt-1.5 text-sm text-neutral-500">
                We will show you exactly how stores in your category increase repeat visits. Zero commitment.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Your Name
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
                    <User className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm font-medium placeholder-neutral-400 focus:border-violet-500 focus:bg-white focus:outline-none transition-all"
                    placeholder="Enter your name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  WhatsApp Number
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
                    <Phone className="h-4 w-4" />
                  </span>
                  <input
                    type="tel"
                    required
                    pattern="[0-9]{10}"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm font-medium placeholder-neutral-400 focus:border-violet-500 focus:bg-white focus:outline-none transition-all"
                    placeholder="e.g. 9876543210"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                  Shop Name
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
                    <Store className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={formData.shopName}
                    onChange={(e) => setFormData({ ...formData, shopName: e.target.value })}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm font-medium placeholder-neutral-400 focus:border-violet-500 focus:bg-white focus:outline-none transition-all"
                    placeholder="e.g. Mannathu Textiles"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                    Store Type
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3 px-3 text-sm font-medium focus:border-violet-500 focus:bg-white focus:outline-none transition-all appearance-none"
                    required
                  >
                    <option value="">Select...</option>
                    <option value="Textile / Clothing">Textile / Clothing</option>
                    <option value="Jewellery">Jewellery</option>
                    <option value="Fashion / Footwear">Fashion / Footwear</option>
                    <option value="Supermarket / Grocery">Supermarket</option>
                    <option value="Restaurant / Bakery">Bakery / Cafe</option>
                    <option value="Furniture Store">Furniture</option>
                    <option value="Other Business">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-1">
                    City / Town
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
                      <MapPin className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 py-3 pl-10 pr-4 text-sm font-medium placeholder-neutral-400 focus:border-violet-500 focus:bg-white focus:outline-none transition-all"
                      placeholder="e.g. Kochi"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 rounded-2xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 py-3.5 text-center text-sm font-semibold text-white shadow-lg shadow-violet-600/20 hover:shadow-violet-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparing Demo Proposal...
                  </>
                ) : (
                  "Submit & Confirm on WhatsApp"
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="py-8 text-center flex flex-col items-center justify-center">
            <div className="h-16 w-16 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 mb-4 animate-bounce">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-neutral-900">Request Received!</h3>
            <p className="mt-2 text-sm text-neutral-500 max-w-xs mx-auto">
              Redirecting you to WhatsApp to connect with our representative and schedule your slot.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-emerald-600 bg-emerald-50/50 px-3 py-1.5 rounded-full border border-emerald-100/50">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Opening WhatsApp...
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
