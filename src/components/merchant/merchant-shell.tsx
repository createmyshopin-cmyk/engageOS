"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  Gift,
  Trophy,
  MessageSquare,
  BarChart3,
  Radio,
  Settings,
  HelpCircle,
  Menu,
  X,
  ChevronRight,
  Zap,
  Bell,
  LogOut,
  AlertTriangle,
  Blocks,
} from "lucide-react";

import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/m/dashboard" },
  { icon: Megaphone, label: "Campaigns", href: "/m/campaigns" },
  { icon: Trophy, label: "Winners", href: "/m/winners" },
  { icon: Gift, label: "Rewards", href: "/m/rewards" },
  { icon: Radio, label: "Sources", href: "/m/sources" },
  { icon: Users, label: "Customers", href: "#" },
  { icon: MessageSquare, label: "WhatsApp", href: "/m/whatsapp" },
  { icon: Blocks, label: "Integrations", href: "/m/integrations" },
  { icon: BarChart3, label: "Reports", href: "#" },
  { icon: Settings, label: "Settings", href: "#" },
  { icon: HelpCircle, label: "Help & Support", href: "#" },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * A native <form> that POSTs to /m/logout.
 * Works without any JS client-side redirect — the server handles the 303.
 */
function LogoutForm({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form method="POST" action="/m/logout" className={className}>
      <button type="submit" className="w-full" aria-label="Confirm logout">
        {children}
      </button>
    </form>
  );
}

interface MerchantShellProps {
  businessName: string;
  city?: string | null;
  campaignActive?: boolean;
  children: React.ReactNode;
  hideHeader?: boolean;
  customHeader?: React.ReactNode;
}

export function MerchantShell({
  businessName,
  city,
  campaignActive = false,
  children,
  hideHeader = false,
  customHeader,
}: MerchantShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const pathname = usePathname();
  const avatarRef = useRef<HTMLDivElement>(null);

  // Close avatar dropdown when clicking outside
  useEffect(() => {
    if (!avatarMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [avatarMenuOpen]);

  // Reset logout confirm panel when sidebar collapses on mobile
  useEffect(() => {
    if (!sidebarOpen) {
      setTimeout(() => setLogoutConfirm(false), 300);
    }
  }, [sidebarOpen]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed top-0 left-0 z-40 h-full w-64 bg-[#111827] flex flex-col
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen shrink-0
        `}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
          <div className="flex items-center justify-center size-8 rounded-xl bg-[#16A34A] shadow-lg shadow-green-500/30">
            <Zap className="size-4.5 text-white fill-white" />
          </div>
          <div>
            <span className="text-white font-black text-sm tracking-tight">
              EngageOS
            </span>
            <span className="block text-[10px] font-semibold text-white/40 -mt-0.5 uppercase tracking-widest">
              Merchant
            </span>
          </div>
          <button
            className="ml-auto lg:hidden text-white/50 hover:text-white"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
            const active = href !== "#" && pathname.startsWith(href);
            return (
              <Link
                key={label}
                href={href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all
                  ${
                    active
                      ? "bg-[#16A34A] text-white shadow-md shadow-green-500/20"
                      : "text-white/55 hover:text-white hover:bg-white/8"
                  }
                `}
              >
                <Icon className="size-4.5 shrink-0" />
                <span>{label}</span>
                {active && <ChevronRight className="size-3.5 ml-auto opacity-60" />}
              </Link>
            );
          })}
        </nav>

        {/* Current plan badge */}
        <div className="mx-3 mb-3 rounded-2xl bg-white/6 border border-white/10 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
              Current Plan
            </span>
            <span className="inline-flex items-center gap-1 text-[9px] font-black bg-[#16A34A]/20 text-[#22C55E] px-2 py-0.5 rounded-full border border-[#16A34A]/30">
              <span className="size-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              Active
            </span>
          </div>
          <p className="text-sm font-bold text-white">Growth Plan</p>
          <p className="text-[10px] text-white/40 mt-0.5">Valid until 28 Nov, 2025</p>
          <button className="mt-2.5 w-full text-[11px] font-bold text-[#22C55E] hover:text-white transition-colors text-left">
            Manage Plan →
          </button>
        </div>

        {/* ── Profile + Logout ── */}
        <div className="border-t border-white/10">
          {/* Logout confirmation panel — slides in above the profile row */}
          {logoutConfirm && (
            <div className="mx-3 mt-3 rounded-2xl bg-red-950/60 border border-red-500/20 p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-red-400 shrink-0" />
                <p className="text-xs font-bold text-red-300">Sign out of EngageOS?</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLogoutConfirm(false)}
                  className="flex-1 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 text-xs font-bold py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <LogoutForm className="flex-1">
                  <span className="flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-1.5 px-3 transition-colors">
                    <LogOut className="size-3.5" />
                    Sign out
                  </span>
                </LogoutForm>
              </div>
            </div>
          )}

          {/* Profile row */}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center size-9 rounded-xl bg-[#16A34A] text-white text-xs font-black shrink-0">
                {initials(businessName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{businessName}</p>
                {city && (
                  <p className="text-[10px] text-white/40 truncate">{city}</p>
                )}
              </div>
            </div>

            {/* Logout toggle button */}
            <button
              type="button"
              onClick={() => setLogoutConfirm((v) => !v)}
              title={logoutConfirm ? "Cancel logout" : "Logout"}
              aria-label={logoutConfirm ? "Cancel logout" : "Logout"}
              aria-expanded={logoutConfirm}
              className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                logoutConfirm
                  ? "text-red-400 bg-red-500/10"
                  : "text-white/40 hover:text-white hover:bg-white/10"
              }`}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        {!hideHeader && (
          <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-[#E5E7EB] px-4 lg:px-8 py-3.5">
            <div className="max-w-7xl mx-auto w-full flex items-center gap-4">
              {/* Mobile menu toggle */}
              <button
                className="lg:hidden -ml-1 flex items-center justify-center size-9 rounded-xl text-[#111827] hover:bg-[#F8FAFC] transition-colors"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </button>

              {customHeader ? (
                customHeader
              ) : (
                <>
                  {/* Greeting */}
                  <div className="flex-1 min-w-0">
                    <h1 className="text-base lg:text-lg font-black text-[#111827] truncate">
                      {getGreeting()}, {businessName} 👋
                    </h1>
                    <p className="text-[11px] text-[#6B7280] font-medium hidden sm:block">
                      Grow your business by turning walk-ins into repeat customers.
                    </p>
                  </div>

                  {/* Right side actions */}
                  <div className="flex items-center gap-3">
                    {campaignActive && (
                      <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#DCFCE7] text-[#16A34A] text-xs font-bold border border-[#16A34A]/20">
                        <span className="size-1.5 rounded-full bg-[#16A34A] animate-pulse" />
                        Campaign Active
                      </span>
                    )}

                    {/* Notification bell */}
                    <button
                      className="relative flex items-center justify-center size-9 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F8FAFC] transition-colors"
                      aria-label="Notifications"
                    >
                      <Bell className="size-4.5 text-[#374151]" />
                      <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#EF4444]" />
                    </button>

                    {/* Avatar with dropdown */}
                    <div className="relative" ref={avatarRef}>
                      <button
                        type="button"
                        onClick={() => setAvatarMenuOpen((v) => !v)}
                        aria-label="Account menu"
                        aria-expanded={avatarMenuOpen}
                        aria-haspopup="menu"
                        className="flex items-center justify-center size-9 rounded-xl bg-[#16A34A] text-white text-xs font-black cursor-pointer hover:bg-[#166534] transition-colors"
                      >
                        {initials(businessName)}
                      </button>

                      {/* Dropdown menu */}
                      {avatarMenuOpen && (
                        <div
                          role="menu"
                          className="absolute right-0 top-11 w-52 bg-white rounded-2xl border border-[#E5E7EB] shadow-xl shadow-black/8 py-2 z-50"
                        >
                          {/* User info header */}
                          <div className="px-4 py-3 border-b border-[#F3F4F6]">
                            <p className="text-sm font-bold text-[#111827] truncate">
                              {businessName}
                            </p>
                            {city && (
                              <p className="text-xs text-[#6B7280] truncate">{city}</p>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="py-1">
                            <LogoutForm>
                              <span
                                role="menuitem"
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-[#EF4444] hover:bg-red-50 transition-colors cursor-pointer"
                              >
                                <LogOut className="size-4 shrink-0" />
                                Sign out
                              </span>
                            </LogoutForm>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </header>
        )}

        {/* Page content */}
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-8 py-6 space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
