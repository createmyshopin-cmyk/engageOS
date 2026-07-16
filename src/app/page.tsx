import type { Metadata } from "next";
import { Reveal } from "@/components/landing/reveal";
import { StickyCta } from "@/components/landing/sticky-cta";
import { HeroMockupTabs } from "@/components/landing/hero-mockup-tabs";
import { InteractiveDashboard } from "@/components/landing/interactive-dashboard";
import { CustomerJourney } from "@/components/landing/customer-journey";
import { PhoneMock } from "@/components/landing/phone-mock";
import { ConversionButtons } from "@/components/landing/conversion-buttons";
import { 
  Sparkles, 
  ArrowRight, 
  Check, 
  QrCode, 
  MessageSquare, 
  Gift, 
  Database, 
  Users, 
  BarChart3, 
  TrendingUp, 
  ShieldCheck, 
  Smartphone, 
  Zap, 
  Clock, 
  CheckCircle2,
  Calendar,
  Ticket,
  HelpCircle
} from "lucide-react";

export const metadata: Metadata = {
  title: "EngageOS — Turn Every Walk-in Customer Into a Repeat Customer",
  description:
    "India's WhatsApp-first customer engagement platform for offline retail stores. Grow your customer database, run QR campaigns, automate WhatsApp marketing, and increase repeat sales.",
  openGraph: {
    title: "EngageOS — Turn walk-ins into repeat customers",
    description:
      "QR campaigns, Scratch & Win, customer database and WhatsApp marketing for offline retail stores in India.",
    type: "website",
    locale: "en_IN",
    siteName: "EngageOS",
  },
  twitter: {
    card: "summary_large_image",
    title: "EngageOS — Turn walk-ins into repeat customers",
    description:
      "QR campaigns, Scratch & Win and WhatsApp marketing for offline retail stores in India.",
  },
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  const waNumber = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "919074744747").replace(/[^\d]/g, "");
  const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent("Hi! I want to know more about EngageOS for my shop.")}`;

  return (
    <div className="bg-neutral-50 text-neutral-900 min-h-screen selection:bg-violet-100 selection:text-violet-900">
      <JsonLd />

      {/* ================= ONAM FESTIVE BANNER ================= */}
      <div className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-amber-500 py-2.5 px-4 text-center text-white text-xs font-semibold tracking-wide relative z-40 shadow-sm">
        <span className="inline-flex items-center gap-1.5">
          🪔 <span className="font-bold">Onam Launch Special Offer:</span> Get ₹5,000 worth of offline marketing standee set up for free. First 15 stores only!
        </span>
      </div>

      {/* ================= NAVIGATION BAR ================= */}
      <nav className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-neutral-100/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="h-9 w-9 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-violet-600/20">
              E
            </span>
            <p className="text-xl font-black tracking-tight text-neutral-900">
              Engage<span className="text-violet-600">OS</span>
            </p>
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-neutral-600">
            <a href="#how-it-works" className="hover:text-neutral-900 transition-colors">How It Works</a>
            <a href="#features" className="hover:text-neutral-900 transition-colors">Features</a>
            <a href="#dashboard" className="hover:text-neutral-900 transition-colors">Dashboard</a>
            <a href="#pricing" className="hover:text-neutral-900 transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-neutral-900 transition-colors">FAQ</a>
          </div>

          <div className="flex items-center gap-3">
            <a 
              href={waUrl}
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs font-bold text-neutral-600 hover:text-neutral-900 transition-colors px-3 py-2 hidden sm:block"
            >
              Support Chat
            </a>
            <ConversionButtons variant="nav" />
          </div>
        </div>
      </nav>

      {/* ================= HERO SECTION ================= */}
      <header className="relative overflow-hidden pt-12 pb-24 md:pt-20 md:pb-32 bg-white border-b border-neutral-100">
        {/* Glow Effects */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_0%,rgba(124,58,237,0.06),transparent),radial-gradient(35%_35%_at_80%_20%,rgba(236,72,153,0.05),transparent)]"
        />
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-neutral-100 to-transparent" />
        
        <div className="relative mx-auto max-w-6xl px-5">
          <div className="grid items-center gap-16 lg:grid-cols-12">
            
            {/* Left Column: Text Content */}
            <div className="lg:col-span-7 flex flex-col items-start">
              <Reveal>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-violet-50 px-3.5 py-1 text-xs font-bold text-violet-700 mb-6 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" /> India&apos;s #1 WhatsApp Loyalty Platform
                </span>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.08] tracking-tight text-neutral-950">
                  Turn Every Walk-in Customer Into a{" "}
                  <span className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-amber-500 bg-clip-text text-transparent">
                    Repeat Customer
                  </span>.
                </h1>
              </Reveal>

              <Reveal delay={160}>
                <p className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-neutral-500 font-medium">
                  Grow your customer database, run QR campaigns, automate WhatsApp marketing, and increase repeat sales—all from one platform designed for busy, offline business owners.
                </p>
              </Reveal>

              {/* Action Buttons */}
              <Reveal delay={240} className="w-full sm:w-auto">
                <ConversionButtons variant="hero" className="mt-8" />
              </Reveal>

              {/* Trust Indicators */}
              <Reveal delay={320}>
                <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-neutral-400 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-emerald-500 stroke-[3]" /> Setup in One Visit
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-emerald-500 stroke-[3]" /> No Customer App Installs
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-emerald-500 stroke-[3]" /> Works on Any Phone
                  </div>
                </div>
              </Reveal>

              {/* Quick category list */}
              <Reveal delay={400}>
                <div className="mt-10 border-t border-neutral-100 pt-8 w-full">
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Helping Offline Retail Categories</p>
                  <div className="flex flex-wrap gap-2.5">
                    {["Textile Shops", "Fashion Stores", "Jewellery", "Footwear", "Restaurants", "Bakeries", "Supermarkets", "Furniture"].map((cat) => (
                      <span key={cat} className="text-xs bg-neutral-50 border border-neutral-150 px-3 py-1.5 rounded-xl text-neutral-600 font-bold">
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>
            
            {/* Right Column: Simulator & Dashboard Tabs */}
            <div className="lg:col-span-5 relative flex justify-center w-full">
              <Reveal delay={200} className="w-full">
                <HeroMockupTabs />
              </Reveal>
            </div>

          </div>
        </div>
      </header>

      {/* ================= OUTCOME PROOF / SOCIAL PROOF ================= */}
      <section className="py-16 bg-white border-b border-neutral-100 relative z-20">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-center text-xs font-bold text-neutral-400 uppercase tracking-widest mb-10">
            Trusted by Retail Businesses
          </p>
          
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ["500+", "Happy Merchants", "Textile & retail stores running campaigns"],
              ["1,200+", "Campaigns Launched", "Scratch cards, lucky draws & coupons"],
              ["150,000+", "Customers Collected", "Verified customer phone numbers saved"],
              ["45,000+", "Coupons Redeemed", "Physical footfalls back into stores"],
            ].map(([num, label, desc]) => (
              <div key={label} className="rounded-2xl border border-neutral-100 bg-neutral-50/50 p-5 text-center shadow-sm hover:shadow-md transition-shadow">
                <p className="text-3xl sm:text-4xl font-black tracking-tight text-neutral-950 bg-gradient-to-br from-neutral-900 to-neutral-700 bg-clip-text text-transparent">
                  {num}
                </p>
                <p className="mt-2 text-xs font-extrabold text-violet-600 uppercase tracking-wide">{label}</p>
                <p className="mt-1 text-[10px] text-neutral-400 leading-normal font-semibold max-w-[180px] mx-auto">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= PROBLEM SECTION ================= */}
      <section className="py-20 md:py-28 bg-neutral-50">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1 rounded-full uppercase tracking-wider">
                The Retail Challenge
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-neutral-950 leading-tight">
                Why offline retail stores struggle to grow repeat sales
              </h2>
              <p className="mt-4 text-sm text-neutral-500 font-semibold leading-relaxed">
                Traditional advertising is failing offline merchants. Newspaper pamphlets, billboards, and online ads are expensive, unmeasurable, and bring zero long-term customer value.
              </p>
            </div>
          </Reveal>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: "🚪",
                title: "Customers Never Return",
                body: "Up to 70% of walk-ins buy once, leave, and you never hear from them again. There is no automated follow-up loop."
              },
              {
                icon: "📋",
                title: "No Customer Database",
                body: "You've run your shop for years, serving thousands. Yet, you do not own a verified database of their numbers."
              },
              {
                icon: "🔇",
                title: "No Follow-up Channel",
                body: "When new festival stocks arrive or slow weekdays need a boost, you have no direct way to contact past buyers."
              },
              {
                icon: "🪔",
                title: "Onam Campaigns End with No Value",
                body: "Huge crowds buy during festival rushes, but when the festival season ends, you capture zero lifetime customer data."
              },
              {
                icon: "💸",
                title: "Advertising is Too Expensive",
                body: "Paying ₹200+ per lead online or ₹15,000+ for local newspaper leaflets that just end up in the trash is burning cash."
              },
              {
                icon: "📉",
                title: "Unmeasurable Marketing Spend",
                body: "You spend thousands on flyers, but you cannot trace a single rupee of sales back to the specific paper inserts."
              }
            ].map((item, i) => (
              <Reveal key={item.title} delay={i * 60}>
                <div className="h-full rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm hover:shadow-md hover:border-neutral-200 transition-all group">
                  <div className="h-12 w-12 rounded-xl bg-neutral-50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                    {item.icon}
                  </div>
                  <h3 className="mt-4 text-base font-extrabold text-neutral-900">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-neutral-500 font-medium">
                    {item.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= SOLUTION / TIMELINE ================= */}
      <section id="how-it-works" className="py-24 bg-neutral-950 text-white relative overflow-hidden">
        {/* Ambient background glows */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_40%_at_20%_80%,rgba(124,58,237,0.15),transparent),radial-gradient(35%_35%_at_80%_20%,rgba(236,72,153,0.1),transparent)]" />
        <div className="absolute inset-0 dots-pattern-dark opacity-40" />

        <div className="relative mx-auto max-w-4xl px-5">
          <Reveal>
            <div className="text-center mb-16">
              <span className="text-xs font-bold text-violet-400 bg-violet-950/80 border border-violet-800 px-3 py-1 rounded-full uppercase tracking-wider">
                The EngageOS Workflow
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-white leading-tight">
                Turn Walk-ins into Repeat Revenue in 7 Steps
              </h2>
              <p className="mt-3 text-neutral-400 text-sm max-w-lg mx-auto font-medium">
                Here is the exact journey of a customer scan at your checkout counter:
              </p>
            </div>
          </Reveal>

          {/* Solution Timeline */}
          <div className="relative border-l border-neutral-800 ml-4 sm:ml-6 space-y-12">
            {[
              {
                step: "1",
                title: "Customer Enters Shop",
                desc: "Sees a custom standee or cash counter poster promoting your Scratch & Win festival campaign."
              },
              {
                step: "2",
                title: "Scans the QR Code",
                desc: "Uses their standard camera app to scan. Opens instantly in their browser with no app downloads."
              },
              {
                step: "3",
                title: "Plays the Campaign",
                desc: "Rubs their screen to scratch and reveal an exciting, instant discount or reward coupon."
              },
              {
                step: "4",
                title: "Receives Reward",
                desc: "Input Name + WhatsApp number to unlock their prize. The verification is fast and secure."
              },
              {
                step: "5",
                title: "Business Collects Customer",
                desc: "Shopper's profile is automatically captured and logged inside your private dashboard."
              },
              {
                step: "6",
                title: "WhatsApp Follow-up Automation",
                desc: "The digital coupon and custom greetings go directly to their WhatsApp, ensuring high visibility."
              },
              {
                step: "7",
                title: "Customer Returns to Shop",
                desc: "Expiry notifications prompt the customer to return and purchase again to redeem their prize."
              }
            ].map((item, i) => (
              <div key={item.step} className="relative pl-10 group">
                {/* Vertical line indicator circle */}
                <div className="absolute left-[-17px] top-0 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 border border-neutral-700 text-xs font-bold text-violet-400 group-hover:bg-violet-600 group-hover:border-violet-500 group-hover:text-white transition-all shadow-md">
                  {item.step}
                </div>
                
                <Reveal delay={i * 60}>
                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-violet-400 transition-colors">{item.title}</h3>
                    <p className="mt-1.5 text-xs text-neutral-400 leading-relaxed font-medium max-w-xl">
                      {item.desc}
                    </p>
                  </div>
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FEATURES SECTION ================= */}
      <section id="features" className="py-24 bg-white border-b border-neutral-100">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-xs font-bold text-violet-600 bg-violet-50 border border-violet-100 px-3 py-1 rounded-full uppercase tracking-wider">
                Built-in Features
              </span>
              <h2 className="mt-4 text-3xl sm:text-4xl font-black tracking-tight text-neutral-950 leading-tight">
                Everything you need to automate repeat sales
              </h2>
              <p className="mt-3 text-sm text-neutral-500 font-semibold">
                Designed to run automatically in the background while you focus on serving walk-in buyers.
              </p>
            </div>
          </Reveal>

          {/* Features Grid with custom CSS/SVG representation */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            
            {/* Feature 1 */}
            <Reveal className="h-full">
              <div className="flex flex-col justify-between h-full rounded-3xl border border-neutral-100 bg-neutral-50/50 p-6 hover:shadow-lg transition-all hover:bg-white hover:-translate-y-1">
                <div>
                  <div className="h-32 w-full rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-50 border border-violet-100/50 flex items-center justify-center overflow-hidden relative">
                    <svg className="h-16 w-16 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="2" width="6" height="6" rx="1" />
                      <rect x="16" y="2" width="6" height="6" rx="1" />
                      <rect x="2" y="16" width="6" height="6" rx="1" />
                      <path d="M16 16h2v2h-2zm4 4h2v2h-2zm-2 2h2v-2h-2zm2-4h2v-2h-2zm-6 2h2v-2h-2zm-2 2h2v-2h-2zm2-6h2v-2h-2zm-6-2H8M8 8V2m8 10h6M12 2v6" strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-violet-500 to-transparent top-1/4 animate-pulse" />
                  </div>
                  <h3 className="mt-5 text-sm font-extrabold text-neutral-900">QR Campaigns</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 font-medium">
                    Print-ready campaign standees custom-generated with your store logo. Frame them at billing counters.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Feature 2 */}
            <Reveal className="h-full" delay={50}>
              <div className="flex flex-col justify-between h-full rounded-3xl border border-neutral-100 bg-neutral-50/50 p-6 hover:shadow-lg transition-all hover:bg-white hover:-translate-y-1">
                <div>
                  <div className="h-32 w-full rounded-2xl bg-gradient-to-br from-fuchsia-100 to-pink-50 border border-fuchsia-100/50 flex items-center justify-center overflow-hidden relative">
                    <svg className="h-16 w-16 text-fuchsia-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="9" y1="9" x2="15" y2="15" strokeLinecap="round" />
                      <path d="M15 9c2 2-2 4-2 6" strokeLinecap="round" />
                    </svg>
                    <Sparkles className="absolute right-8 top-8 h-5 w-5 text-amber-500 animate-bounce" />
                  </div>
                  <h3 className="mt-5 text-sm font-extrabold text-neutral-900">Scratch &amp; Win</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 font-medium">
                    The interactive game shoppers cannot resist. Delivers immediate reward dopamine, boosting opt-in rates.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Feature 3 */}
            <Reveal className="h-full" delay={100}>
              <div className="flex flex-col justify-between h-full rounded-3xl border border-neutral-100 bg-neutral-50/50 p-6 hover:shadow-lg transition-all hover:bg-white hover:-translate-y-1">
                <div>
                  <div className="h-32 w-full rounded-2xl bg-gradient-to-br from-amber-100 to-yellow-50 border border-amber-100/50 flex items-center justify-center overflow-hidden relative">
                    <svg className="h-16 w-16 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="9" />
                      <line x1="12" y1="3" x2="12" y2="21" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
                      <line x1="18.4" y1="5.6" x2="5.6" y2="18.4" />
                    </svg>
                  </div>
                  <h3 className="mt-5 text-sm font-extrabold text-neutral-900">Lucky Draw</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 font-medium">
                    Engage larger crowds during bumper festival weeks with grand prizes and scheduled automated drawings.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Feature 4 */}
            <Reveal className="h-full" delay={150}>
              <div className="flex flex-col justify-between h-full rounded-3xl border border-neutral-100 bg-neutral-50/50 p-6 hover:shadow-lg transition-all hover:bg-white hover:-translate-y-1">
                <div>
                  <div className="h-32 w-full rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-50 border border-emerald-100/50 flex items-center justify-center overflow-hidden relative">
                    <svg className="h-16 w-16 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="6" y1="9" x2="6" y2="15" strokeLinecap="round" />
                      <line x1="9" y1="9" x2="9" y2="15" strokeLinecap="round" strokeWidth="2.5" />
                      <line x1="13" y1="9" x2="13" y2="15" strokeLinecap="round" />
                      <line x1="15.5" y1="9" x2="15.5" y2="15" strokeLinecap="round" strokeWidth="2" />
                      <line x1="18" y1="9" x2="18" y2="15" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h3 className="mt-5 text-sm font-extrabold text-neutral-900">Coupon System</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 font-medium">
                    Digital vouchers distributed and redeemed via staff billing panel. Stops coupon fraud.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Feature 5 */}
            <Reveal className="h-full">
              <div className="flex flex-col justify-between h-full rounded-3xl border border-neutral-100 bg-neutral-50/50 p-6 hover:shadow-lg transition-all hover:bg-white hover:-translate-y-1">
                <div>
                  <div className="h-32 w-full rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-50 border border-blue-100/50 flex items-center justify-center overflow-hidden relative">
                    <svg className="h-16 w-16 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                  <h3 className="mt-5 text-sm font-extrabold text-neutral-900">Customer Database</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 font-medium">
                    Store and organize your customer records. Filter by category, and export anytime to Excel.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Feature 6 */}
            <Reveal className="h-full" delay={50}>
              <div className="flex flex-col justify-between h-full rounded-3xl border border-neutral-100 bg-neutral-50/50 p-6 hover:shadow-lg transition-all hover:bg-white hover:-translate-y-1">
                <div>
                  <div className="h-32 w-full rounded-2xl bg-gradient-to-br from-green-100 to-emerald-50 border border-green-100/50 flex items-center justify-center overflow-hidden relative">
                    <svg className="h-16 w-16 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </div>
                  <h3 className="mt-5 text-sm font-extrabold text-neutral-900">WhatsApp Automation</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 font-medium">
                    Deliver vouchers, greetings, and expiry warnings. Broadcast offers to past visitors in 1-click.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Feature 7 */}
            <Reveal className="h-full" delay={100}>
              <div className="flex flex-col justify-between h-full rounded-3xl border border-neutral-100 bg-neutral-50/50 p-6 hover:shadow-lg transition-all hover:bg-white hover:-translate-y-1">
                <div>
                  <div className="h-32 w-full rounded-2xl bg-gradient-to-br from-rose-100 to-red-50 border border-rose-100/50 flex items-center justify-center overflow-hidden relative">
                    <svg className="h-16 w-16 text-rose-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="9" y1="3" x2="9" y2="21" />
                      <line x1="9" y1="12" x2="21" y2="12" />
                    </svg>
                  </div>
                  <h3 className="mt-5 text-sm font-extrabold text-neutral-900">Merchant Dashboard</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 font-medium">
                    A mobile-optimized merchant portal to monitor campaign progress. Zero computer required.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Feature 8 */}
            <Reveal className="h-full" delay={150}>
              <div className="flex flex-col justify-between h-full rounded-3xl border border-neutral-100 bg-neutral-50/50 p-6 hover:shadow-lg transition-all hover:bg-white hover:-translate-y-1">
                <div>
                  <div className="h-32 w-full rounded-2xl bg-gradient-to-br from-cyan-100 to-sky-50 border border-cyan-100/50 flex items-center justify-center overflow-hidden relative">
                    <svg className="h-16 w-16 text-cyan-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <line x1="18" y1="20" x2="18" y2="10" strokeLinecap="round" />
                      <line x1="12" y1="20" x2="12" y2="4" strokeLinecap="round" />
                      <line x1="6" y1="20" x2="6" y2="14" strokeLinecap="round" />
                    </svg>
                  </div>
                  <h3 className="mt-5 text-sm font-extrabold text-neutral-900">Real-time Analytics</h3>
                  <p className="mt-2 text-[11px] leading-relaxed text-neutral-500 font-medium">
                    Trace every single rupee of repeat revenue directly back to customer scans and coupons.
                  </p>
                </div>
              </div>
            </Reveal>

          </div>
        </div>
      </section>

      {/* ================= BENEFITS SECTION ================= */}
      <section className="py-20 bg-neutral-50 border-b border-neutral-100">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl font-black text-neutral-950">How EngageOS Delivers Business Results</h2>
              <p className="text-xs text-neutral-500 mt-2 font-bold uppercase tracking-wider font-mono">Measurable Store Value</p>
            </div>
          </Reveal>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["📈", "Increase Repeat Customers", "Vouchers and scratch rewards incentivize shoppers to return for their next billing rather than going to competitors."],
              ["📂", "Build Your Own Customer Database", "Stop relying on rented advertising platforms. Build a list of 10,000+ local customer numbers that you own forever."],
              ["💬", "Grow WhatsApp Audience", "Build a direct marketing list compliant with optical opt-in guidelines. Reach customers directly inside their primary chat app."],
              ["💰", "Increase Sales", "Drive active checkout footfalls with automated festival reminder notifications, ensuring your billing counters stay busy."],
              ["🎯", "Run Unlimited Campaigns", "Launch Scratch & Win during Onam, Spin the Wheel on festival weeks, and Lucky Draws during bumper weekends without extra fees."],
              ["🎟", "Measure Results", "Trace every single rupee of repeat sales directly back to counter scans, telling you exactly which campaign brought the highest ROI."]
            ].map(([emoji, title, desc], i) => (
              <Reveal key={title} delay={i * 50}>
                <div className="flex items-start gap-4">
                  <span className="h-10 w-10 rounded-2xl bg-white border border-neutral-150 flex items-center justify-center text-xl shrink-0 shadow-sm">
                    {emoji}
                  </span>
                  <div>
                    <h3 className="font-extrabold text-neutral-900 text-sm leading-tight">{title}</h3>
                    <p className="mt-1.5 text-xs text-neutral-500 leading-relaxed font-medium font-sans">
                      {desc}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================= MERCHANDISING DASHBOARD PREVIEW ================= */}
      <section id="dashboard" className="py-24 bg-white border-b border-neutral-100">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="text-center max-w-xl mx-auto mb-16">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-700 bg-violet-50 px-3 py-1 rounded-full uppercase tracking-wider mb-4 border border-violet-100">
                <BarChart3 className="h-3 w-3" /> Live Operations
              </span>
              <h2 className="text-3xl font-black text-neutral-950 tracking-tight leading-tight">
                Beautiful laptop and mobile mockups
              </h2>
              <p className="mt-3 text-sm text-neutral-500 font-medium">
                Monitor Today&apos;s Customers, Coupons Redeemed, Campaign Status, Customer Growth, and your overall Business Health Score from any device.
              </p>
            </div>
          </Reveal>

          {/* Double Mockup Layout (Laptop + Mobile overlay) */}
          <div className="grid gap-12 lg:grid-cols-12 items-center">
            
            {/* Left text column */}
            <div className="lg:col-span-4 lg:order-2">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-extrabold text-neutral-900 leading-tight">Real-Time Counter Analytics</h3>
                  <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                    Watch campaign metrics update in real-time as walk-ins scan standees and win digital discount cards.
                  </p>
                </div>
                
                <ul className="space-y-3">
                  {[
                    "Monitor coupon redemption codes directly at cash registers",
                    "Database grows automatically with name and WhatsApp logs",
                    "Redemption verification takes under 4 seconds via staff panel",
                    "Export all records to Excel in 1-click for loyalty promotions"
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs font-semibold text-neutral-600">
                      <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[9px] font-bold text-violet-750">
                        ✓
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right mockups column */}
            <div className="lg:col-span-8 lg:order-1 relative">
              {/* Laptop Wrapper */}
              <div className="w-full relative mx-auto max-w-[640px]">
                {/* Screen Bezel */}
                <div className="bg-neutral-900 p-2.5 sm:p-3.5 rounded-t-3xl border border-neutral-850 shadow-2xl relative">
                  {/* Window Controls Decor */}
                  <div className="absolute top-3.5 left-4 flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                  {/* Screen Content */}
                  <div className="bg-neutral-50 rounded-xl overflow-hidden border border-neutral-950/20 pt-4">
                    <InteractiveDashboard />
                  </div>
                </div>
                {/* Keyboard Base Deck */}
                <div className="h-3.5 sm:h-5 bg-gradient-to-b from-neutral-800 to-neutral-900 rounded-b-2xl border-t border-neutral-700 relative shadow-xl">
                  {/* Trackpad notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-14 sm:w-20 h-1.5 bg-neutral-950 rounded-b-md" />
                </div>
              </div>

              {/* Floating Mobile Phone Mockup Overlaying Laptop (Right side) */}
              <div className="absolute -right-4 bottom-[-40px] z-20 hidden md:block scale-80 origin-bottom-right">
                <PhoneMock />
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* ================= CUSTOMER JOURNEY LOOP ================= */}
      <section className="py-24 bg-neutral-950 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_50%,rgba(124,58,237,0.1),transparent)]" />
        <div className="mx-auto max-w-6xl px-5 relative z-10">
          <Reveal>
            <div className="text-center max-w-xl mx-auto mb-16">
              <span className="text-xs font-bold text-violet-400 bg-violet-950/80 border border-violet-850 px-3 py-1 rounded-full uppercase tracking-wider">
                The Customer Journey
              </span>
              <h2 className="text-3xl font-black tracking-tight text-white leading-tight mt-4">
                Animated Step-by-Step Flywheel
              </h2>
              <p className="text-xs text-neutral-400 mt-2 font-medium">
                Click steps to explore how offline walk-ins translate to WhatsApp loyalty and repeat billing:
              </p>
            </div>
          </Reveal>

          {/* Interactive animated customer journey component */}
          <Reveal delay={80}>
            <CustomerJourney />
          </Reveal>
        </div>
      </section>

      {/* ================= TESTIMONIALS ================= */}
      <section className="py-24 bg-white border-b border-neutral-100">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="text-center max-w-xl mx-auto mb-16">
              <span className="text-xs font-bold text-violet-700 bg-violet-50 px-3 py-1 rounded-full uppercase tracking-wider">
                Merchant Case Studies
              </span>
              <h2 className="text-3xl font-black text-neutral-950 mt-4 leading-tight">
                Real Business Results from Pilot Stores
              </h2>
            </div>
          </Reveal>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                quote: "We collected 1,240 verified customer phone numbers in just two weeks of our Onam campaign. 24% of them have already returned for a second purchase. This is much better than newspaper inserts.",
                name: "Manoj Nair",
                business: "Mannathu Textiles, Alappuzha",
                result: "1,240+ Leads Captured",
                image: "/manoj.png"
              },
              {
                quote: "Customers love the Scratch & Win game. Our staff just asks them to scan the QR code at checkout. We have built a database of 3,500+ local food lovers that we can message anytime.",
                name: "Devika S.",
                business: "Gourmet Bakes, Kochi",
                result: "+31% Repeat Footfall",
                image: "/devika.png"
              },
              {
                quote: "The digital coupon system is extremely simple. Our billing staff can verify and redeem coupons in 5 seconds using a phone scanner. Highly recommended for busy retail shops.",
                name: "Aravind K.",
                business: "Kalyan Footwears, Thrissur",
                result: "93% Redemption Rate",
                image: "/aravind.png"
              }
            ].map((t) => (
              <figure
                key={t.name}
                className="rounded-3xl border border-neutral-100 bg-neutral-50/50 p-6 shadow-sm flex flex-col justify-between hover:border-neutral-200 transition-all"
              >
                <blockquote className="text-xs leading-relaxed text-neutral-600 font-semibold italic">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="mt-6 pt-5 border-t border-neutral-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img 
                      src={t.image} 
                      alt={t.name} 
                      className="h-10 w-10 rounded-full object-cover border border-neutral-200 shadow-sm"
                    />
                    <div>
                      <p className="text-xs font-black text-neutral-900">{t.name}</p>
                      <p className="text-[9px] text-neutral-400 font-extrabold uppercase">{t.business}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-violet-650 bg-violet-50 border border-violet-100/50 px-2.5 py-1 rounded-lg">
                    {t.result}
                  </span>
                </div>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ================= PRICING ================= */}
      <section id="pricing" className="py-24 bg-neutral-50 border-b border-neutral-100 scroll-mt-12">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="text-center max-w-xl mx-auto mb-16">
              <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1 rounded-full uppercase tracking-wider">
                Launch Offer
              </span>
              <h2 className="text-3xl font-black text-neutral-950 mt-4 leading-tight">
                One package. Everything included.
              </h2>
              <p className="text-xs text-neutral-500 font-semibold mt-2 leading-relaxed">
                Less than the cost of one local pamphlet insert—and this one drives measurable repeat sales.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-violet-250 bg-white shadow-2xl shadow-violet-600/5 relative">
              
              {/* Decorative top ribbon */}
              <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 px-8 py-7 text-center text-white">
                <span className="inline-block bg-white/20 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full mb-3">
                  🔥 Onam Campaign Package
                </span>
                <p className="text-5xl font-black tracking-tight">₹4,999</p>
                <p className="mt-1 text-xs text-violet-100 font-semibold uppercase tracking-wide">
                  One-Time Setup · Full Festival Season
                </p>
              </div>

              {/* Package Content Checklist */}
              <ul className="space-y-3.5 px-8 py-8 border-b border-neutral-100">
                {[
                  ["QR Campaign poster creation (Customized with store branding)", true],
                  ["Scratch & Win mobile game customized to your prizes", true],
                  ["Store checkout coupon redemption system app for staff", true],
                  ["Customer CRM database dashboard + CSV file export", true],
                  ["Live mobile reporting merchant dashboard dashboard", true],
                  ["On-site standee & cash counter flyers layout guidance", true],
                  ["1-on-1 support and staff training at your shop", true],
                  ["1,000 verified WhatsApp campaign credits included", true],
                ].map(([f, active]) => (
                  <li key={f as string} className="flex items-start gap-3 text-xs font-semibold text-neutral-600">
                    <CheckCircle2 className="h-4.5 w-4.5 text-violet-600 shrink-0 mt-0.5" />
                    <span>{f as string}</span>
                  </li>
                ))}
              </ul>

              {/* pricing buttons */}
              <div className="px-8 pb-8 pt-6 bg-neutral-50/50">
                <ConversionButtons variant="pricing" />
                <p className="mt-3 text-center text-[10px] text-neutral-400 font-semibold">
                  ⚠️ Limit: 15 stores only. Onboarding closes as slots fill up.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ================= FAQ SECTION ================= */}
      <section id="faq" className="py-24 bg-white border-b border-neutral-100 scroll-mt-12">
        <div className="mx-auto max-w-3xl px-5">
          <Reveal>
            <div className="text-center max-w-xl mx-auto mb-16">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-50 text-neutral-500 mb-3 border border-neutral-100">
                <HelpCircle className="h-5 w-5" />
              </span>
              <h2 className="text-3xl font-black text-neutral-950 tracking-tight leading-tight">
                Frequently Asked Questions
              </h2>
              <p className="mt-2 text-xs text-neutral-400 font-bold uppercase tracking-wider">Everything you need to know</p>
            </div>
          </Reveal>

          <div className="space-y-4">
            {FAQS.map(([q, a]) => (
              <details
                key={q}
                className="group rounded-2xl border border-neutral-100 bg-neutral-50/50 px-6 py-4.5 shadow-sm open:bg-white open:border-neutral-200 transition-all cursor-pointer"
              >
                <summary className="list-none font-bold text-neutral-900 text-xs sm:text-sm">
                  <span className="flex items-center justify-between gap-4">
                    {q}
                    <span
                      aria-hidden
                      className="text-neutral-400 group-open:rotate-45 transition-transform text-lg"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3.5 text-xs leading-relaxed text-neutral-500 font-medium">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FINAL CTA ================= */}
      <section className="bg-neutral-950 text-white relative overflow-hidden">
        {/* Glow effects */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_100%,rgba(124,58,237,0.15),transparent)]" />
        <div className="absolute inset-0 dots-pattern-dark opacity-30" />

        <div className="relative mx-auto max-w-4xl px-5 py-24 text-center">
          <Reveal>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
              Ready to Increase Your Store Sales?
            </h2>
            <p className="mt-4 text-neutral-400 text-sm max-w-md mx-auto font-medium">
              Book a Free Demo Today. Talk to our representative and see how simple it is to get live.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <ConversionButtons variant="footer" className="mt-8" />
          </Reveal>

          <Reveal delay={200}>
            <p className="mt-6 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
              No technical skill required · We manage the entire counter standee setup
            </p>
          </Reveal>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="bg-white border-t border-neutral-100 pb-28 md:pb-10 relative z-20">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-gradient-to-tr from-violet-600 to-fuchsia-600 flex items-center justify-center text-white font-black text-sm">
              E
            </span>
            <p className="text-sm font-bold text-neutral-950">
              Engage<span className="text-violet-600">OS</span>
            </p>
          </div>
          
          <p className="text-[10px] text-neutral-400 font-semibold">
            © 2026 EngageOS · India&apos;s WhatsApp-First customer engagement platform for offline retail · Kerala, India
          </p>
          
          <div className="flex items-center gap-6 text-[11px] font-semibold text-neutral-400">
            <a href="#how-it-works" className="hover:text-neutral-900 transition-colors">How It Works</a>
            <a href="#features" className="hover:text-neutral-900 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-neutral-900 transition-colors">Pricing</a>
          </div>
        </div>
      </footer>

      <StickyCta waHref={waUrl} />
    </div>
  );
}

const FAQS: Array<[string, string]> = [
  [
    "How long does setup take?",
    "Exactly one store visit. We set up your online portal, design and print your QR code posters/counter flyers, and train your billing staff in under an hour. Your campaign goes live the same day.",
  ],
  [
    "Can I use my own coupons?",
    "Absolutely. You decide the exact rewards (e.g. 10% off, free beverage, ₹500 voucher), their quantities, and how rare each prize is. Customers only receive prizes you have authorized.",
  ],
  [
    "Does it work on mobile?",
    "Yes, it is designed mobile-first. Customers scan and scratch on their own phones, your billing staff verifies coupons on any phone, and you view database growth on yours.",
  ],
  [
    "Can I run multiple campaigns?",
    "The Onam Launch Package includes one full campaign (Scratch & Win). Additional campaigns (Spin the Wheel, Lucky Draws) or year-round loyalty subscriptions can be added after the festive season.",
  ],
  [
    "Do customers need to install an app?",
    "Never. Customers scan the QR code and play instantly inside their default browser. They do not have to install any apps or complete annoying registration flows.",
  ],
];

function JsonLd() {
  const json = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "EngageOS",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "WhatsApp-first customer engagement and loyalty platform for offline retail businesses in India. QR campaigns, Scratch & Win games, and customer databases.",
        offers: {
          "@type": "Offer",
          price: "4999",
          priceCurrency: "INR",
          description: "Onam Launch Package — one full festival campaign",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQS.map(([q, a]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
