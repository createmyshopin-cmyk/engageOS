"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Store,
  Calendar,
  Users,
  MessageSquare,
  Gift,
  BarChart3,
  Settings,
  HelpCircle,
  Bell,
  ChevronDown,
  Menu,
  X,
  Search,
  CalendarDays,
  LogOut
} from "lucide-react";
import { logoutAdminAction } from "@/app/admin/actions";

interface AdminShellProps {
  children: React.ReactNode;
  back?: { href: string; label: string };
}

export function AdminShell({ children, back }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { label: "Merchants", href: "#merchants", icon: Store },
    { label: "Campaigns", href: "#campaigns", icon: Calendar },
    { label: "Customers", href: "#customers", icon: Users },
    { label: "WhatsApp", href: "#whatsapp", icon: MessageSquare },
    { label: "Rewards", href: "#rewards", icon: Gift },
    { label: "Reports", href: "#reports", icon: BarChart3 },
    { label: "Settings", href: "#settings", icon: Settings },
    { label: "Support", href: "https://wa.me/919074744747", icon: HelpCircle, external: true }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-neutral-800">
      
      {/* Mobile Top Bar */}
      <header className="md:hidden sticky top-0 z-50 bg-neutral-900 text-white flex items-center justify-between px-4 py-3 shadow-md">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-admin-green text-sm font-black text-white">
            E
          </span>
          <span className="text-base font-black tracking-tight">
            Engage<span className="text-admin-green">OS</span>
          </span>
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-neutral-400">
            ADMIN
          </span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-neutral-900 text-neutral-300 flex flex-col justify-between border-r border-neutral-800 transition-transform duration-300 md:translate-x-0 md:sticky md:top-0 md:h-screen shrink-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Sidebar Header */}
          <div className="hidden md:flex h-16 items-center px-6 border-b border-neutral-800/60">
            <Link href="/admin" className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-admin-green text-base font-black text-white shadow-md shadow-emerald-900/30">
                E
              </span>
              <span className="text-lg font-black tracking-tight text-white">
                Engage<span className="text-admin-green">OS</span>
              </span>
              <span className="rounded-md bg-neutral-850 border border-neutral-750 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                ADMIN
              </span>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-1.5 scrollbar-thin">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              const baseLink = (
                <div
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? "bg-admin-green text-white shadow-lg shadow-emerald-900/20"
                      : "hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  <Icon className={`size-4.5 shrink-0 ${isActive ? "text-white" : "text-neutral-400"}`} />
                  <span>{item.label}</span>
                </div>
              );

              return item.external ? (
                <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className="block decoration-none">
                  {baseLink}
                </a>
              ) : (
                <Link key={item.label} href={item.href} className="block decoration-none" onClick={() => setMobileMenuOpen(false)}>
                  {baseLink}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-neutral-800/65 bg-neutral-950/40 space-y-4">
          {/* Active Plan Indicator */}
          <div className="rounded-2xl bg-neutral-850 border border-neutral-800 p-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wide">Current Plan</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black text-admin-green border border-emerald-500/20">
                <span className="size-1.5 rounded-full bg-admin-green animate-pulse" />
                Active
              </span>
            </div>
            <p className="mt-1 text-xs font-black text-white">Enterprise Suite</p>
            <p className="text-[9px] text-neutral-500 font-semibold mt-0.5">Renews Nov 28, 2025</p>
          </div>

          {/* User Profile */}
          <div className="flex items-center justify-between p-1.5 rounded-xl hover:bg-neutral-800/50 transition-colors cursor-pointer group">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8.5 rounded-xl bg-neutral-800 border border-neutral-750 flex items-center justify-center text-xs font-bold text-white shadow-sm shrink-0">
                AD
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight group-hover:text-admin-green transition-colors">Admin Operator</p>
                <p className="text-[10px] text-neutral-500 truncate mt-0.5">admin@engageos.com</p>
              </div>
            </div>
            <form action={logoutAdminAction}>
              <button
                type="submit"
                aria-label="Logout"
                className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-red-500/20 transition-colors"
                title="Logout"
              >
                <LogOut className="size-4 shrink-0" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navbar */}
        <header className="hidden md:flex h-16 items-center justify-between px-8 bg-white border-b border-slate-200/80 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-extrabold tracking-tight text-neutral-900">Good morning, Admin 👋</h2>
            <span className="h-4 w-px bg-slate-200" />
            <p className="text-xs text-neutral-400 font-semibold">Here&apos;s what&apos;s happening with your platform today.</p>
          </div>

          <div className="flex items-center gap-4">
            {/* Filter Date Button */}
            <button className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:border-slate-350 hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-neutral-600 transition-all cursor-pointer">
              <CalendarDays className="size-3.5 text-neutral-400" />
              <span>May 20 – Jun 19, 2025</span>
            </button>

            {/* Notifications Bell */}
            <button className="relative p-2 text-neutral-400 hover:text-neutral-700 hover:bg-slate-50 rounded-xl transition-all cursor-pointer">
              <Bell className="size-4.5" />
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-black text-white ring-2 ring-white">
                12
              </span>
            </button>

            {/* Avatar Pill */}
            <div className="flex items-center gap-2 pl-1.5">
              <div className="size-8 rounded-full bg-neutral-950 flex items-center justify-center text-xs font-black text-white border border-slate-200 shadow-sm">
                A
              </div>
            </div>
          </div>
        </header>

        {/* Back Link Breadcrumb */}
        {back && (
          <div className="px-6 md:px-8 pt-5">
            <Link
              href={back.href}
              className="inline-flex items-center gap-1.5 text-xs font-extrabold text-neutral-400 hover:text-neutral-900 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
              {back.label}
            </Link>
          </div>
        )}

        {/* Dashboard Pages Column */}
        <main className="flex-1 px-6 md:px-8 py-6 md:py-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Backdrop overlay for mobile menu */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-neutral-950/40 md:hidden backdrop-blur-xs"
        />
      )}
    </div>
  );
}

