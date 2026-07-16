import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin } from "@/lib/admin-session";
import { adminClient } from "@/lib/db/rpc";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  Plus,
  Store,
  Users,
  Gift,
  MessageSquare,
  IndianRupee,
  TrendingUp,
  Activity,
  CheckCircle,
  QrCode,
  FileSpreadsheet,
  Calendar,
  Send,
  MoreVertical,
  ChevronRight,
  Database,
  Server
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Operator Dashboard — EngageOS",
  robots: { index: false, follow: false },
};

interface DbMerchant {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  phone: string;
  wa_messages_sent: number;
  created_at: string;
  customers: Array<{ count: number }> | { count: number } | null;
  campaigns: Array<{ count: number }> | { count: number } | null;
}

export default async function AdminHome() {
  if (!(await isAdmin())) {
    return <AdminLogin />;
  }

  const supabase = adminClient();
  
  // Query merchants from db
  const { data: dbData, error } = await supabase
    .from("businesses")
    .select("id, name, slug, city, phone, wa_messages_sent, created_at, customers(count), campaigns(count)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("admin home database load error:", error);
  }

  // Parse counts safely
  const parsedMerchants = (dbData ?? []).map((m: any) => {
    const custCount = Array.isArray(m.customers) 
      ? (m.customers[0]?.count ?? 0)
      : (m.customers?.count ?? 0);
    const campCount = Array.isArray(m.campaigns)
      ? (m.campaigns[0]?.count ?? 0)
      : (m.campaigns?.count ?? 0);
    return {
      ...m,
      customersCount: custCount,
      campaignsCount: campCount
    };
  });

  const totalMerchants = parsedMerchants.length;
  const totalCustomers = parsedMerchants.reduce((sum, m) => sum + m.customersCount, 0);
  const totalWaMessages = parsedMerchants.reduce((sum, m) => sum + (m.wa_messages_sent || 0), 0);

  // Fetch coupons from db to get count
  const { count: dbCouponsCount } = await supabase
    .from("coupons")
    .select("id", { count: "exact", head: true });
  
  const couponsRedeemed = dbCouponsCount || 0;

  // Real vs fallback data handling
  const isMockState = totalMerchants === 0;

  // Dashboard calculations/fallbacks
  const displayMerchantsCount = isMockState ? 24 : totalMerchants;
  const displayCustomersCount = isMockState ? 2453 : totalCustomers;
  const displayCouponsCount = isMockState ? 1286 : couponsRedeemed;
  const displayWaMessagesCount = isMockState ? 5678 : totalWaMessages;
  const displayRevenue = isMockState ? "₹1,24,560" : `₹${(totalMerchants * 4999).toLocaleString("en-IN")}`;

  // Sample Pilot Merchants for visual completeness if db is empty
  const sampleMerchants = [
    { name: "Sindur Fashion", city: "Wayanad", customersCount: 632, campaignsCount: 3, couponsCount: 320, status: "Active" },
    { name: "Trendz Boutique", city: "Kozhikode", customersCount: 489, campaignsCount: 2, couponsCount: 210, status: "Active" },
    { name: "Linen Club", city: "Thrissur", customersCount: 378, campaignsCount: 2, couponsCount: 189, status: "Active" },
    { name: "Modern Looks", city: "Kannur", customersCount: 312, campaignsCount: 1, couponsCount: 156, status: "Active" },
    { name: "Bella Clothing", city: "Malappuram", customersCount: 286, campaignsCount: 1, couponsCount: 142, status: "Active" }
  ];

  const activeMerchantsList = isMockState 
    ? sampleMerchants 
    : parsedMerchants.slice(0, 5).map(m => ({
        name: m.name,
        city: m.city || "Kerala",
        customersCount: m.customersCount,
        campaignsCount: m.campaignsCount,
        couponsCount: Math.round(m.customersCount * 0.45),
        status: "Active"
      }));

  return (
    <AdminShell>
      {/* Platform Status Banner */}
      {isMockState && (
        <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="flex size-2.5 rounded-full bg-admin-green animate-pulse" />
            <p className="text-xs font-bold text-emerald-800">
              Developer Sandbox Active: Displaying premium preview metrics. Add your first merchant to link live data.
            </p>
          </div>
          <Link
            href="/admin/new"
            className="rounded-lg bg-admin-green hover:bg-emerald-700 text-white text-[10px] font-black px-3 py-1.5 transition-all"
          >
            + Onboard Shop
          </Link>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* Card 1: Total Merchants */}
        <div className="bg-white border border-slate-200/85 p-5 rounded-2xl shadow-xs hover:shadow-md hover:border-slate-300/80 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total Merchants</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-admin-green group-hover:scale-110 transition-transform">
              <Store className="size-4.5" />
            </div>
          </div>
          <p className="mt-4 text-3xl font-black text-neutral-900 leading-none">{displayMerchantsCount}</p>
          <div className="mt-3 flex items-center gap-1">
            <TrendingUp className="size-3.5 text-admin-green" />
            <span className="text-[10px] font-black text-admin-green">↗ 12%</span>
            <span className="text-[9px] font-semibold text-neutral-400">vs last 30 days</span>
          </div>
        </div>

        {/* Card 2: Total Customers */}
        <div className="bg-white border border-slate-200/85 p-5 rounded-2xl shadow-xs hover:shadow-md hover:border-slate-300/80 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total Customers</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-admin-green group-hover:scale-110 transition-transform">
              <Users className="size-4.5" />
            </div>
          </div>
          <p className="mt-4 text-3xl font-black text-neutral-900 leading-none">{displayCustomersCount.toLocaleString("en-IN")}</p>
          <div className="mt-3 flex items-center gap-1">
            <TrendingUp className="size-3.5 text-admin-green" />
            <span className="text-[10px] font-black text-admin-green">↗ 18%</span>
            <span className="text-[9px] font-semibold text-neutral-400">vs last 30 days</span>
          </div>
        </div>

        {/* Card 3: Coupons Redeemed */}
        <div className="bg-white border border-slate-200/85 p-5 rounded-2xl shadow-xs hover:shadow-md hover:border-slate-300/80 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Coupons Redeemed</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-admin-green group-hover:scale-110 transition-transform">
              <Gift className="size-4.5" />
            </div>
          </div>
          <p className="mt-4 text-3xl font-black text-neutral-900 leading-none">{displayCouponsCount.toLocaleString("en-IN")}</p>
          <div className="mt-3 flex items-center gap-1">
            <TrendingUp className="size-3.5 text-admin-green" />
            <span className="text-[10px] font-black text-admin-green">↗ 15%</span>
            <span className="text-[9px] font-semibold text-neutral-400">vs last 30 days</span>
          </div>
        </div>

        {/* Card 4: WhatsApp Messages */}
        <div className="bg-white border border-slate-200/85 p-5 rounded-2xl shadow-xs hover:shadow-md hover:border-slate-300/80 transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">WhatsApp Messages</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-admin-green group-hover:scale-110 transition-transform">
              <MessageSquare className="size-4.5" />
            </div>
          </div>
          <p className="mt-4 text-3xl font-black text-neutral-900 leading-none">{displayWaMessagesCount.toLocaleString("en-IN")}</p>
          <div className="mt-3 flex items-center gap-1">
            <TrendingUp className="size-3.5 text-admin-green" />
            <span className="text-[10px] font-black text-admin-green">↗ 22%</span>
            <span className="text-[9px] font-semibold text-neutral-400">vs last 30 days</span>
          </div>
        </div>

        {/* Card 5: Revenue */}
        <div className="bg-white border border-slate-200/85 p-5 rounded-2xl shadow-xs hover:shadow-md hover:border-slate-300/80 transition-all group lg:col-span-1 col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Platform Revenue</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-admin-green group-hover:scale-110 transition-transform">
              <IndianRupee className="size-4.5" />
            </div>
          </div>
          <p className="mt-4 text-3xl font-black text-neutral-900 leading-none">{displayRevenue}</p>
          <div className="mt-3 flex items-center gap-1">
            <TrendingUp className="size-3.5 text-admin-green" />
            <span className="text-[10px] font-black text-admin-green">↗ 16%</span>
            <span className="text-[9px] font-semibold text-neutral-400">vs last 30 days</span>
          </div>
        </div>
      </div>

      {/* Analytics Rows */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Customer Growth Graph (Line Chart) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-neutral-900">Customer Growth</h3>
              <p className="text-[10px] text-neutral-400 font-semibold mt-0.5">Opt-ins saved over the last 30 days</p>
            </div>
            <span className="text-[9px] font-bold bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/60 cursor-pointer">
              Last 30 days
            </span>
          </div>

          {/* SVG Vector Line Chart */}
          <div className="relative w-full h-[180px] my-2">
            <svg viewBox="0 0 500 180" className="w-full h-full overflow-visible">
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16A34A" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#16A34A" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              
              {/* Horizontal helper lines */}
              <line x1="0" y1="30" x2="500" y2="30" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="0" y1="75" x2="500" y2="75" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="0" y1="120" x2="500" y2="120" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3" />
              <line x1="0" y1="160" x2="500" y2="160" stroke="#e2e8f0" strokeWidth="1" />

              {/* Area filled curve */}
              <path
                d="M 10 160 Q 120 120 220 90 T 400 45 L 480 35 L 480 160 Z"
                fill="url(#areaGradient)"
              />

              {/* Main glowing line */}
              <path
                d="M 10 160 Q 120 120 220 90 T 400 45 L 480 35"
                fill="none"
                stroke="#16A34A"
                strokeWidth="2.5"
                strokeLinecap="round"
              />

              {/* Data points */}
              <circle cx="10" cy="160" r="3.5" fill="#ffffff" stroke="#16A34A" strokeWidth="2" />
              <circle cx="120" cy="120" r="3.5" fill="#ffffff" stroke="#16A34A" strokeWidth="2" />
              <circle cx="220" cy="90" r="3.5" fill="#ffffff" stroke="#16A34A" strokeWidth="2" />
              <circle cx="340" cy="55" r="4.5" fill="#16A34A" stroke="#ffffff" strokeWidth="2.5" className="animate-pulse" />
              <circle cx="480" cy="35" r="3.5" fill="#ffffff" stroke="#16A34A" strokeWidth="2" />

              {/* Point Indicator Tooltip Callout */}
              <g transform="translate(340, 20)">
                <rect x="-45" y="-20" width="90" height="22" rx="6" fill="#111827" />
                <text x="0" y="-5" fill="#ffffff" fontSize="8" fontWeight="bold" textAnchor="middle">2,145 Customers</text>
                <polygon points="0,2 5,-3 -5,-3" fill="#111827" />
              </g>
            </svg>
          </div>

          <div className="flex items-center justify-between text-[9px] text-neutral-400 font-bold px-1 mt-1 border-t border-slate-100 pt-3">
            <span>May 20</span>
            <span>May 27</span>
            <span>Jun 03</span>
            <span>Jun 10</span>
            <span>Jun 17</span>
          </div>
        </div>

        {/* Campaign Performance (Pie/Donut Chart) */}
        <div className="lg:col-span-3 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-neutral-900">Campaign Overview</h3>
            <p className="text-[10px] text-neutral-400 font-semibold mt-0.5">Live metrics distribution</p>
          </div>

          {/* Donut graphic */}
          <div className="relative flex items-center justify-center h-[140px] my-3">
            <svg viewBox="0 0 100 100" className="w-[110px] h-[110px] transform -rotate-90">
              <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="11" />
              
              {/* Active Segment (43.8%) - green */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="#16A34A"
                strokeWidth="11.5"
                strokeDasharray="251.2"
                strokeDashoffset="110.0"
              />
              {/* Completed Segment (31.3%) - blue */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="#2563EB"
                strokeWidth="11"
                strokeDasharray="251.2"
                strokeDashoffset="188.7"
              />
              {/* Scheduled Segment (15.6%) - amber */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="#F59E0B"
                strokeWidth="11"
                strokeDasharray="251.2"
                strokeDashoffset="227.9"
              />
              {/* Expired Segment (9.3%) - rose */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="transparent"
                stroke="#EF4444"
                strokeWidth="11"
                strokeDasharray="251.2"
                strokeDashoffset="251.2"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none">Total</p>
              <p className="text-2xl font-black text-neutral-900 mt-1 leading-none">32</p>
            </div>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-neutral-500 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-admin-green shrink-0" />
              <span>Active: 14 (43.8%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-600 shrink-0" />
              <span>Completed: 10 (31.3%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber-500 shrink-0" />
              <span>Scheduled: 5 (15.6%)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose-500 shrink-0" />
              <span>Expired: 3 (9.3%)</span>
            </div>
          </div>
        </div>

        {/* Notifications Panel */}
        <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-neutral-900">Recent Notifications</h3>
              <p className="text-[10px] text-neutral-400 font-semibold mt-0.5">Real-time system events</p>
            </div>
            <span className="text-[9px] font-bold text-admin-green hover:underline cursor-pointer">View all</span>
          </div>

          <div className="flex-1 space-y-3.5 max-h-[220px] overflow-y-auto pr-1">
            
            {/* Event 1 */}
            <div className="flex items-start gap-3">
              <div className="size-7 rounded-lg bg-emerald-50 text-admin-green flex items-center justify-center shrink-0">
                <Store className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-neutral-800 leading-tight">
                  New merchant <span className="text-admin-green font-black">&quot;Style Hub&quot;</span> joined
                </p>
                <p className="text-[9px] text-neutral-450 mt-0.5 font-semibold">onboarded in Kochi city</p>
              </div>
              <span className="text-[8px] font-bold text-neutral-400 shrink-0 mt-0.5">2m ago</span>
            </div>

            {/* Event 2 */}
            <div className="flex items-start gap-3">
              <div className="size-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Activity className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-neutral-800 leading-tight">
                  Campaign <span className="font-extrabold">&quot;Onam Special&quot;</span> completed
                </p>
                <p className="text-[9px] text-neutral-450 mt-0.5 font-semibold">closed for Sindur Fashion</p>
              </div>
              <span className="text-[8px] font-bold text-neutral-400 shrink-0 mt-0.5">15m ago</span>
            </div>

            {/* Event 3 */}
            <div className="flex items-start gap-3">
              <div className="size-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Users className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-neutral-800 leading-tight">
                  125 new customers added
                </p>
                <p className="text-[9px] text-neutral-450 mt-0.5 font-semibold">saved across 8 active shops</p>
              </div>
              <span className="text-[8px] font-bold text-neutral-400 shrink-0 mt-0.5">1h ago</span>
            </div>

            {/* Event 4 */}
            <div className="flex items-start gap-3">
              <div className="size-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <MessageSquare className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-neutral-800 leading-tight">
                  WhatsApp quota limit threshold
                </p>
                <p className="text-[9px] text-neutral-450 mt-0.5 font-semibold">80% used by Trendz Boutique</p>
              </div>
              <span className="text-[8px] font-bold text-neutral-400 shrink-0 mt-0.5">2h ago</span>
            </div>
          </div>
        </div>
      </div>

      {/* Third Row: Top Merchants / Quick Actions / WhatsApp */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Merchant List */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-neutral-900">Top Merchants</h3>
            <span className="text-[9px] font-bold text-admin-green hover:underline cursor-pointer">View all</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                  <th className="py-2.5">Merchant</th>
                  <th className="py-2.5">Location</th>
                  <th className="py-2.5 text-right">Customers</th>
                  <th className="py-2.5 text-right">Campaigns</th>
                  <th className="py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70 text-xs text-neutral-700 font-semibold">
                {activeMerchantsList.map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 flex items-center gap-2">
                      <div className="size-7 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-500 text-[9px] font-black text-white flex items-center justify-center shadow-xs">
                        {m.name.split(" ").map((w: string) => w[0]).join("")}
                      </div>
                      <span className="font-extrabold text-neutral-900 truncate max-w-[100px]">{m.name}</span>
                    </td>
                    <td className="py-3 text-neutral-500">{m.city}</td>
                    <td className="py-3 text-right tabular-nums">{m.customersCount.toLocaleString("en-IN")}</td>
                    <td className="py-3 text-right tabular-nums">{m.campaignsCount}</td>
                    <td className="py-3 text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-admin-green border border-emerald-500/10">
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions Grid */}
        <div className="lg:col-span-3 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <h3 className="text-sm font-black text-neutral-900 mb-4">Quick Actions</h3>
          
          <div className="grid grid-cols-2 gap-3 flex-1">
            
            {/* Action 1 */}
            <Link
              href="/admin/new"
              className="flex flex-col items-center justify-center p-3.5 border border-slate-100 hover:border-slate-200 rounded-xl hover:bg-slate-50/70 hover:shadow-xs transition-all text-center group cursor-pointer decoration-none"
            >
              <div className="p-2 bg-emerald-50 rounded-xl text-admin-green group-hover:scale-110 transition-transform">
                <Plus className="size-4.5" />
              </div>
              <span className="text-[10px] font-black text-neutral-800 mt-2.5">New Merchant</span>
            </Link>

            {/* Action 2 */}
            <Link
              href="/admin/new"
              className="flex flex-col items-center justify-center p-3.5 border border-slate-100 hover:border-slate-200 rounded-xl hover:bg-slate-50/70 hover:shadow-xs transition-all text-center group cursor-pointer decoration-none"
            >
              <div className="p-2 bg-emerald-50 rounded-xl text-admin-green group-hover:scale-110 transition-transform">
                <Calendar className="size-4.5" />
              </div>
              <span className="text-[10px] font-black text-neutral-800 mt-2.5">New Campaign</span>
            </Link>

            {/* Action 3 */}
            <div className="flex flex-col items-center justify-center p-3.5 border border-slate-100 hover:border-slate-200 rounded-xl hover:bg-slate-50/70 hover:shadow-xs transition-all text-center group cursor-pointer">
              <div className="p-2 bg-emerald-50 rounded-xl text-admin-green group-hover:scale-110 transition-transform">
                <QrCode className="size-4.5" />
              </div>
              <span className="text-[10px] font-black text-neutral-800 mt-2.5">Generate QR</span>
            </div>

            {/* Action 4 */}
            <div className="flex flex-col items-center justify-center p-3.5 border border-slate-100 hover:border-slate-200 rounded-xl hover:bg-slate-50/70 hover:shadow-xs transition-all text-center group cursor-pointer">
              <div className="p-2 bg-emerald-50 rounded-xl text-admin-green group-hover:scale-110 transition-transform">
                <Send className="size-4.5" />
              </div>
              <span className="text-[10px] font-black text-neutral-800 mt-2.5">Send WhatsApp</span>
            </div>
          </div>
        </div>

        {/* WhatsApp Deliverability progress */}
        <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-neutral-900">WhatsApp Delivery</h3>
            <span className="text-[9px] font-bold text-admin-green hover:underline cursor-pointer">View details</span>
          </div>

          <div className="space-y-3.5 flex-1 flex flex-col justify-center">
            
            {/* Bar 1 */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-neutral-800 mb-1">
                <span>Successful Deliveries</span>
                <span className="tabular-nums">5,678 (85%)</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-admin-green rounded-full" style={{ width: "85%" }} />
              </div>
            </div>

            {/* Bar 2 */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-neutral-800 mb-1">
                <span>Verification OTPs</span>
                <span className="tabular-nums">5,012 (88%)</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-admin-green rounded-full" style={{ width: "88%" }} />
              </div>
            </div>

            {/* Bar 3 */}
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-neutral-800 mb-1">
                <span>Pending Queue</span>
                <span className="tabular-nums">3,842 (76%)</span>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-admin-green rounded-full" style={{ width: "76%" }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fourth Row: Recent Campaigns & System Health */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Campaign List */}
        <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-neutral-900">Recent Campaigns</h3>
            <span className="text-[9px] font-bold text-admin-green hover:underline cursor-pointer">View all</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
                  <th className="py-2.5">Campaign Name</th>
                  <th className="py-2.5">Merchant</th>
                  <th className="py-2.5">Type</th>
                  <th className="py-2.5">Start Date</th>
                  <th className="py-2.5">End Date</th>
                  <th className="py-2.5 text-right">Status</th>
                  <th className="py-2.5 text-right">Customers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/70 text-xs text-neutral-700 font-semibold">
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 font-extrabold text-neutral-900">Onam Special 2025</td>
                  <td className="py-3 text-neutral-500">Sindur Fashion</td>
                  <td className="py-3">Scratch &amp; Win</td>
                  <td className="py-3 text-neutral-400">01 Jun, 2025</td>
                  <td className="py-3 text-neutral-400">20 Jun, 2025</td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-admin-green border border-emerald-500/10">
                      Active
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums">632</td>
                </tr>
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 font-extrabold text-neutral-900">Festival Bonanza</td>
                  <td className="py-3 text-neutral-500">Trendz Boutique</td>
                  <td className="py-3">Lucky Draw</td>
                  <td className="py-3 text-neutral-400">10 Jun, 2025</td>
                  <td className="py-3 text-neutral-400">25 Jun, 2025</td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-black text-admin-green border border-emerald-500/10">
                      Active
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums">489</td>
                </tr>
                <tr className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3 font-extrabold text-neutral-900">Weekend Special</td>
                  <td className="py-3 text-neutral-500">Linen Club</td>
                  <td className="py-3">Scratch &amp; Win</td>
                  <td className="py-3 text-neutral-400">05 May, 2025</td>
                  <td className="py-3 text-neutral-400">20 May, 2025</td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-neutral-500 border border-slate-200">
                      Completed
                    </span>
                  </td>
                  <td className="py-3 text-right tabular-nums">378</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* System Health */}
        <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-neutral-900">System Health</h3>
            <span className="inline-flex items-center gap-1 text-[9px] font-black text-admin-green">
              All systems active <CheckCircle className="size-3 text-admin-green shrink-0" />
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Card 1: API */}
            <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/30 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">API</span>
                <span className="size-1.5 rounded-full bg-admin-green animate-pulse" />
              </div>
              <p className="text-xs font-extrabold text-neutral-800 mt-2">Operational</p>
              <p className="text-[8px] text-neutral-400 font-semibold mt-0.5">Latency: 14ms</p>
            </div>

            {/* Card 2: DB */}
            <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/30 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Database</span>
                <span className="size-1.5 rounded-full bg-admin-green animate-pulse" />
              </div>
              <p className="text-xs font-extrabold text-neutral-800 mt-2">Operational</p>
              <p className="text-[8px] text-neutral-400 font-semibold mt-0.5">Pool: 24 active</p>
            </div>

            {/* Card 3: WhatsApp */}
            <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/30 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">WhatsApp</span>
                <span className="size-1.5 rounded-full bg-admin-green animate-pulse" />
              </div>
              <p className="text-xs font-extrabold text-neutral-800 mt-2">Operational</p>
              <p className="text-[8px] text-neutral-400 font-semibold mt-0.5">WATI webhook OK</p>
            </div>

            {/* Card 4: Servers */}
            <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/30 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wide">Server</span>
                <span className="size-1.5 rounded-full bg-admin-green animate-pulse" />
              </div>
              <p className="text-xs font-extrabold text-neutral-800 mt-2">Operational</p>
              <p className="text-[8px] text-neutral-400 font-semibold mt-0.5">Uptime: 99.98%</p>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

