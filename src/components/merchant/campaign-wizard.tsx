"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  Plus,
  Trash2,
  Megaphone,
  Gift,
  Tag,
  CalendarDays,
  FileText,
  Eye,
  Rocket,
  Bell,
  Sparkles,
  Info,
  Clock,
  Check,
  HelpCircle,
  Upload,
  ArrowRight,
  Sparkle,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { createCampaignAction } from "@/app/m/campaigns/actions";

/* ── Types ───────────────────────────────────────────── */
type PrizeType =
  | "coupon"
  | "physical_gift"
  | "gift_voucher"
  | "lucky_draw"
  | "cashback"
  | "wallet_points";

interface PrizeRow {
  name: string;
  weight: number;
  total_quantity: number;
  expiry_days: number;
  prize_type: PrizeType;
  prize_value: number | null;
  is_fallback: boolean;
}

const PRIZE_TYPES: { id: PrizeType; label: string; hint: string; hasValue: boolean }[] = [
  { id: "coupon", label: "Coupon", hint: "Discount code redeemed in-store", hasValue: false },
  { id: "physical_gift", label: "Physical Gift", hint: "Collected at the counter", hasValue: false },
  { id: "gift_voucher", label: "Gift Voucher", hint: "Fixed-value voucher code", hasValue: true },
  { id: "lucky_draw", label: "Lucky Draw Entry", hint: "Entry into an end-of-campaign draw", hasValue: false },
  { id: "cashback", label: "Cashback", hint: "Amount credited back", hasValue: true },
  { id: "wallet_points", label: "Wallet Points", hint: "Loyalty points added", hasValue: true },
];

interface WizardData {
  name: string;
  headline: string;
  description: string;
  banner_url: string;
  logo_url: string;
  terms: string;
  coupon_prefix: string;
  starts_at: string;
  ends_at: string;
  prizes: PrizeRow[];
}

type CampaignType =
  | "scratch_win"
  | "spin_win"
  | "lucky_draw"
  | "quiz_challenge"
  | "collect_win"
  | "coupon_drop";

interface CouponRules {
  win_mode: "weighted" | "always";
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  minimum_subtotal: number | null;
  usage_limit: number | null;
  applies_once_per_customer: boolean;
  expiry_days: number | null;
  currency: string;
  pool_target: number;
  pool_low_watermark: number;
}

const DEFAULT_COUPON_RULES: CouponRules = {
  win_mode: "weighted",
  discount_type: "percentage",
  discount_value: 10,
  minimum_subtotal: null,
  usage_limit: 1,
  applies_once_per_customer: true,
  expiry_days: 30,
  currency: "INR",
  pool_target: 500,
  pool_low_watermark: 100,
};

interface CampaignTypeOption {
  id: CampaignType;
  title: string;
  badge?: string;
  description: string;
  benefits: string[];
  engagement: number;
  setupTime: string;
  conversion: string;
  industries: string[];
  howItWorks: string;
  successTip: string;
  bestFor: string;
}

/* ── Wizard Steps ────────────────────────────────────── */
const STEPS = [
  { id: 1, label: "Basic Info", sub: "Campaign details" },
  { id: 2, label: "Campaign Type", sub: "Select game type" },
  { id: 3, label: "Rewards", sub: "Add prizes & coupons" },
  { id: 4, label: "Coupons", sub: "Upload or generate" },
  { id: 5, label: "Duration", sub: "Set campaign period" },
  { id: 6, label: "Preview", sub: "Review & publish" },
];

/* ── Campaign Type Data ────────────────────────────── */
const CAMPAIGN_TYPES: CampaignTypeOption[] = [
  {
    id: "scratch_win",
    title: "Scratch & Win",
    badge: "Most Popular",
    description: "Customers scratch a virtual card to instantly win exciting prizes.",
    benefits: ["Instant results", "High engagement"],
    engagement: 5,
    setupTime: "5 - 10 minutes",
    conversion: "35% - 50%",
    industries: ["Fashion", "Textiles", "Jewellery", "Electronics", "Restaurants"],
    howItWorks: "Customer scans QR → plays game → wins instant prize",
    bestFor: "Festivals, offers, product launches, store promotions",
    successTip: "Keep grand prizes highly attractive to boost scans on weekends.",
  },
  {
    id: "spin_win",
    title: "Spin & Win",
    description: "Customers spin a fortune wheel to win exciting rewards.",
    benefits: ["Fun experience", "Great retention"],
    engagement: 5,
    setupTime: "5 - 10 minutes",
    conversion: "40% - 60%",
    industries: ["Supermarkets", "Bakeries", "Restaurants", "Beauty Salons"],
    howItWorks: "Customer scans QR → spins wheel → wins instant prize",
    bestFor: "High retention, seasonal games, newsletter subscriptions",
    successTip: "Use vibrant colors for the wheel segments to match your store theme.",
  },
  {
    id: "lucky_draw",
    title: "Lucky Draw",
    description: "Collect participants and select a random winner at the end of the campaign.",
    benefits: ["Build anticipation", "Perfect for events"],
    engagement: 4,
    setupTime: "3 - 5 minutes",
    conversion: "25% - 40%",
    industries: ["Automobile", "Jewellery", "Real Estate", "Premium Electronics"],
    howItWorks: "Customer scans QR → submits details → enters draw → winner picked",
    bestFor: "High value prizes, building customer database, grand openings",
    successTip: "Promote the grand prize value heavily in your headlines.",
  },
  {
    id: "quiz_challenge",
    title: "Quiz Challenge",
    description: "Engage customers with fun quizzes and reward correct answers.",
    benefits: ["Learn & engage", "Brand recall"],
    engagement: 4,
    setupTime: "10 - 15 minutes",
    conversion: "20% - 35%",
    industries: ["Health & Wellness", "Organic Food", "Kids Products"],
    howItWorks: "Customer scans QR → answers questions → wins prize on correct answers",
    bestFor: "Brand awareness, product education, educational campaigns",
    successTip: "Keep questions simple but relevant to your brand history or product benefits.",
  },
  {
    id: "collect_win",
    title: "Collect & Win",
    description: "Customers collect points/stamps on repeat visits to unlock rewards.",
    benefits: ["Drive repeat visits", "Loyalty booster"],
    engagement: 5,
    setupTime: "10 - 15 minutes",
    conversion: "45% - 70%",
    industries: ["Cafes", "Salons", "Car Wash", "Grocery Stores"],
    howItWorks: "Customer scans QR on repeat visits → collects stamps → unlocks rewards",
    bestFor: "Drive repeat visits, customer loyalty, long term retention",
    successTip: "Reward the first stamp immediately to get customers hooked.",
  },
  {
    id: "coupon_drop",
    title: "Coupon Drop",
    description: "Surprise customers with random discount coupons to boost sales.",
    benefits: ["Boost sales", "Increase footfall"],
    engagement: 3,
    setupTime: "2 - 5 minutes",
    conversion: "30% - 45%",
    industries: ["Supermarkets", "Fast Food", "Spas", "Clothing Boutiques"],
    howItWorks: "Customer scans QR → gets random discount coupon code instantly",
    bestFor: "Clear stock, boost low-sales days, quick marketing campaigns",
    successTip: "Set a short expiration window to create a sense of urgency.",
  },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULT_PRIZES: PrizeRow[] = [
  { name: "10% OFF Coupon", weight: 100, total_quantity: 200, expiry_days: 30, prize_type: "coupon", prize_value: null, is_fallback: false },
  { name: "5% OFF Coupon", weight: 200, total_quantity: 400, expiry_days: 30, prize_type: "coupon", prize_value: null, is_fallback: false },
];

const DEFAULT_BANNER = "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=80";
const DEFAULT_LOGO = "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?auto=format&fit=crop&w=200&h=200&q=80";

const SMART_TIPS = [
  "A clear banner and description increases customer participation by up to 3x.",
  "Adding a high-value grand prize creates organic buzz among local shoppers.",
  "Short and clear descriptions convert passive viewers into active scratchers.",
  "Keep your logo high contrast to build brand recognition on customer receipt scans.",
];

export function CampaignWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<CampaignType>("scratch_win");
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [publishedStatus, setPublishedStatus] = useState<"active" | "scheduled" | "draft">("draft");

  // Form State
  const [name, setName] = useState("Onam Mega Scratch & Win");
  const [description, setDescription] = useState("Play, scratch and win exciting offers this Onam!");
  const [bannerUrl, setBannerUrl] = useState(DEFAULT_BANNER);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO);
  const [headline, setHeadline] = useState("Scratch & Win this Onam! 🎁");
  const [terms, setTerms] = useState("1. One scratch card per customer.\n2. Coupons valid for 30 days.");
  const [couponPrefix, setCouponPrefix] = useState("SINDUR");
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState(futureISO(30));
  const [prizes, setPrizes] = useState<PrizeRow[]>(DEFAULT_PRIZES);

  // Coupon Drop discount rules (only sent when selectedType === 'coupon_drop').
  const [couponRules, setCouponRules] = useState<CouponRules>(DEFAULT_COUPON_RULES);

  // Custom UI state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [tipIndex, setTipIndex] = useState(0);

  // Auto-save interval (15s)
  useEffect(() => {
    const timer = setInterval(() => {
      setSaveStatus("saving");
      setTimeout(() => {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }, 1000);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Tip rotation interval (8s)
  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % SMART_TIPS.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  function futureISO(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // Calculate completion percentage
  const calculateScore = () => {
    let score = 0;
    if (name.trim().length > 3) score += 20;
    if (description.trim().length > 10) score += 20;
    if (bannerUrl) score += 25;
    if (logoUrl) score += 15;
    if (prizes.length > 0) score += 10;
    if (couponPrefix) score += 10;
    return score;
  };

  const score = calculateScore();

  const selectedCampaignOption = CAMPAIGN_TYPES.find((t) => t.id === selectedType)!;

  function updatePrize(index: number, field: keyof PrizeRow, value: string | number) {
    const updated = [...prizes];
    updated[index] = { ...updated[index], [field]: value } as PrizeRow;
    setPrizes(updated);
  }

  function addPrize() {
    setPrizes([...prizes, { name: "", weight: 50, total_quantity: 100, expiry_days: 30, prize_type: "coupon", prize_value: null, is_fallback: false }]);
  }

  function removePrize(index: number) {
    setPrizes(prizes.filter((_, i) => i !== index));
  }

  /** Only one prize may be the fallback; setting one clears the others. */
  function setFallback(index: number, value: boolean) {
    setPrizes(prizes.map((p, i) => ({ ...p, is_fallback: i === index ? value : value ? false : p.is_fallback })));
  }

  function next() {
    if (step === 1) {
      if (!name.trim()) return;
      if (!description.trim()) return;
      if (!bannerUrl) return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 1));
  }

  function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Image size should be less than 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setBannerUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1 * 1024 * 1024) {
      alert("Logo size should be less than 1MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  function publish(asDraft = false) {
    setServerError(null);
    startTransition(async () => {
      const result = await createCampaignAction(undefined as any, {
        name,
        headline,
        description,
        banner_url: bannerUrl,
        logo_url: logoUrl,
        terms,
        coupon_prefix: couponPrefix,
        starts_at: new Date(startsAt),
        ends_at: new Date(endsAt),
        prizes,
        campaign_type: selectedType,
        coupon_rules: selectedType === "coupon_drop" ? couponRules : undefined,
        publish: !asDraft,
      });
      if (result.error) {
        setServerError(result.error);
        setStep(6);
      } else {
        setPublishedStatus((result.status as typeof publishedStatus) ?? (asDraft ? "draft" : "active"));
        setPublished(true);
      }
    });
  }

  if (published) {
    const isLive = publishedStatus === "active";
    const isScheduled = publishedStatus === "scheduled";
    return (
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-12 text-center max-w-lg mx-auto my-12">
        <div className="flex items-center justify-center size-20 rounded-3xl bg-emerald-50 mx-auto mb-6">
          <CheckCircle2 className="size-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-black text-neutral-900 mb-2">
          {isLive ? "Campaign is Live! 🎉" : isScheduled ? "Campaign Scheduled! 🗓️" : "Draft Saved ✏️"}
        </h2>
        <p className="text-neutral-500 mb-8">
          {isLive
            ? "Your campaign is active and ready for QR scans."
            : isScheduled
              ? "Your campaign will go live automatically on its start date."
              : "Your campaign is saved as a draft. Activate it to start getting QR scans."}
        </p>
        <button
          onClick={() => router.push("/m/campaigns")}
          className="w-full bg-[#16A34A] hover:bg-[#15803D] text-white font-bold py-3 rounded-xl transition-colors text-sm cursor-pointer"
        >
          Go to Campaigns →
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#E5E7EB] px-6 lg:px-10 py-4 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
            <span className="hover:text-neutral-600 cursor-pointer" onClick={() => router.push("/m/campaigns")}>Campaigns</span>
            <span>&gt;</span>
            <span className="text-neutral-600">New Campaign</span>
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">Create New Campaign</h1>
            {saveStatus === "saving" && (
              <span className="text-[10px] text-neutral-400 font-bold flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" /> Saving...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                <Check className="size-3" /> Draft Saved
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 hidden sm:block">Create your customer engagement campaign in a few simple steps.</p>
        </div>

        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#DCFCE7] text-[#16A34A] text-[11px] font-bold border border-[#16A34A]/25">
            <span className="size-1.5 rounded-full bg-[#16A34A]" />
            WhatsApp Connected
          </span>
          <button className="relative flex items-center justify-center size-9 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F8FAFC] transition-colors cursor-pointer">
            <Bell className="size-4.5 text-[#374151]" />
            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-[#EF4444]" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center size-9 rounded-xl bg-neutral-900 text-white text-xs font-black">SF</div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-bold text-neutral-900">Sindur Fashion</p>
              <p className="text-[10px] text-neutral-400 font-semibold">Wayanad, Kerala</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Stepper ── */}
      <section className="bg-white border-b border-[#E5E7EB] px-6 lg:px-10 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 overflow-x-auto">
          {STEPS.map((s) => {
            const done = step > s.id;
            const current = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-3 flex-1 min-w-[140px] last:flex-none">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center justify-center size-7 rounded-full text-xs font-black transition-all ${done
                        ? "bg-[#16A34A] text-white"
                        : current
                          ? "bg-neutral-900 text-white ring-4 ring-neutral-900/10"
                          : "bg-neutral-100 text-neutral-400"
                      }`}
                  >
                    {done ? <Check className="size-4" /> : s.id}
                  </div>
                  <div>
                    <span className={`block text-xs font-bold ${current ? "text-neutral-900" : "text-neutral-400"}`}>
                      {s.label}
                    </span>
                    <span className="block text-[10px] text-neutral-400 leading-tight">
                      {done ? "Completed" : s.sub}
                    </span>
                  </div>
                </div>
                {s.id < STEPS.length && (
                  <div className="h-px bg-neutral-200 flex-1 hidden md:block" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Main Layout (Three Columns for Step 1) ── */}
      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            {/* STEP 1 Layout */}
            {step === 1 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Column 1: Form (lg:col-span-5) */}
                <div className="lg:col-span-5 bg-white rounded-3xl border border-neutral-200 shadow-sm p-6 space-y-6">
                  <div>
                    <h2 className="text-lg font-black text-neutral-900 tracking-tight">Basic Information</h2>
                    <p className="text-xs text-neutral-500 mt-0.5">Enter the basic details of your campaign.</p>
                  </div>

                  <Field label="Campaign Name *">
                    <div className="relative">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value.slice(0, 60))}
                        placeholder="e.g. Onam Mega Scratch & Win"
                        className={inputCls}
                        maxLength={60}
                        aria-label="Campaign Name"
                      />
                      <span className="absolute right-3 bottom-2.5 text-[10px] text-neutral-400 font-bold">
                        {name.length}/60
                      </span>
                    </div>
                  </Field>

                  <Field label="Short Description *">
                    <div className="relative">
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value.slice(0, 120))}
                        placeholder="Describe the campaign briefly..."
                        rows={3}
                        className={inputCls + " resize-none pr-12"}
                        maxLength={120}
                        aria-label="Short Description"
                      />
                      <span className="absolute right-3 bottom-2.5 text-[10px] text-neutral-400 font-bold">
                        {description.length}/120
                      </span>
                    </div>
                  </Field>

                  {/* Banner Upload */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-neutral-700">Campaign Banner *</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {bannerUrl ? (
                        <div className="relative h-28 rounded-2xl overflow-hidden border border-neutral-200 group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity duration-200">
                            <label className="text-[10px] font-bold bg-white text-neutral-900 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-neutral-100">
                              Replace
                              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleBannerUpload} className="hidden" />
                            </label>
                            <button
                              onClick={() => setBannerUrl("")}
                              className="text-[10px] font-bold bg-red-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-red-700 cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="h-28 rounded-2xl border-2 border-dashed border-neutral-200 hover:border-neutral-300 flex flex-col items-center justify-center cursor-pointer transition-colors p-4">
                          <Upload className="size-5 text-neutral-400 mb-1.5" />
                          <span className="text-[11px] font-bold text-neutral-700">Click to upload</span>
                          <span className="text-[9px] text-neutral-400 mt-0.5">or drag and drop</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleBannerUpload} className="hidden" />
                        </label>
                      )}
                      <div className="text-[10px] text-neutral-400 leading-relaxed flex flex-col justify-center">
                        <p>Recommended size: 1200 x 600px.</p>
                        <p>Format: JPG, PNG, WEBP.</p>
                        <p>Max size: 2MB.</p>
                      </div>
                    </div>
                  </div>

                  {/* Logo Upload */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-neutral-700">Campaign Logo (Optional)</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {logoUrl ? (
                        <div className="relative size-20 rounded-2xl overflow-hidden border border-neutral-200 group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={logoUrl} alt="Logo" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                            <label className="text-[9px] font-bold bg-white text-neutral-900 rounded-md px-1.5 py-1 cursor-pointer">
                              Replace
                              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoUpload} className="hidden" />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <label className="size-20 rounded-2xl border-2 border-dashed border-neutral-200 hover:border-neutral-300 flex flex-col items-center justify-center cursor-pointer transition-colors">
                          <Upload className="size-4 text-neutral-400 mb-1" />
                          <span className="text-[9px] font-bold text-neutral-700">Upload Logo</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleLogoUpload} className="hidden" />
                        </label>
                      )}
                      <div className="text-[10px] text-neutral-400 leading-relaxed flex flex-col justify-center">
                        <p>Square image format.</p>
                        <p>Max size: 1MB.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 2: Live Mobile Preview (lg:col-span-4) */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                  <div>
                    <h2 className="text-lg font-black text-neutral-900 tracking-tight">Live Preview</h2>
                    <p className="text-xs text-neutral-500 mt-0.5">This is how your campaign will appear to customers.</p>
                  </div>

                  {/* iPhone Mockup Frame */}
                  <div className="relative mx-auto w-full max-w-[280px] aspect-[9/18.5] bg-black rounded-[38px] p-2.5 shadow-2xl ring-1 ring-neutral-900/10">
                    {/* Speaker notch */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4.5 bg-black rounded-full z-20 flex items-center justify-center">
                      <div className="w-10 h-1 bg-neutral-800 rounded-full" />
                    </div>

                    {/* Preview Screen */}
                    <div className="w-full h-full bg-[#F8FAFC] rounded-[30px] overflow-hidden flex flex-col relative select-none">
                      {/* Status bar spacer */}
                      <div className="h-6 bg-transparent" />

                      {/* Mock Banner */}
                      <div className="h-28 bg-neutral-900 relative overflow-hidden shrink-0">
                        {bannerUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={bannerUrl} alt="Preview Banner" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-neutral-800 to-neutral-900">
                            <span className="text-[10px] text-white/20 font-bold uppercase tracking-wider">No Banner Image</span>
                          </div>
                        )}
                        {/* Logo overlay on banner */}
                        {logoUrl && (
                          <div className="absolute bottom-2 left-3 size-8 rounded-lg overflow-hidden border border-white bg-white shadow-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={logoUrl} alt="Preview Logo" className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-3 flex-1 flex flex-col gap-2.5 overflow-y-auto">
                        <div>
                          <h3 className="text-xs font-black text-neutral-900 leading-tight">
                            {name || "Campaign Name"}
                          </h3>
                          <p className="text-[10px] text-neutral-500 mt-0.5 leading-normal">
                            {description || "Campaign short description goes here..."}
                          </p>
                        </div>

                        {/* List items */}
                        <div className="space-y-1.5">
                          <PreviewInfoRow emoji="🎫" label="Game Type" val={selectedCampaignOption.title} />
                          <PreviewInfoRow emoji="📅" label="Duration" val="25 Aug 2025 - 15 Sep 2025" />
                          <PreviewInfoRow emoji="🎁" label="Rewards" val="Exciting Coupons & Prizes" />
                          <PreviewInfoRow emoji="✨" label="Tagline" val="Every Scratch is a Winner!" />
                        </div>

                        {/* Action Button */}
                        <button className="mt-auto w-full bg-[#16A34A] text-white text-[11px] font-black py-2 rounded-xl text-center shadow-md shadow-green-500/20 cursor-default">
                          Play Now
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Rotating tip banner */}
                  <div className="bg-[#DCFCE7]/20 border border-[#16A34A]/10 rounded-2xl p-4 flex gap-3 items-start select-none">
                    <span className="text-base shrink-0">💡</span>
                    <div className="text-left">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Tip</p>
                      <p className="text-xs text-neutral-700 font-semibold mt-0.5 leading-relaxed">
                        {SMART_TIPS[tipIndex]}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Column 3: Campaign Summary (lg:col-span-3) */}
                <div className="lg:col-span-3 space-y-6">
                  <div>
                    <h2 className="text-lg font-black text-neutral-900 tracking-tight">Campaign Summary</h2>
                    <p className="text-xs text-neutral-500 mt-0.5">Review your campaign details.</p>
                  </div>

                  {/* Summary Card */}
                  <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-5 space-y-4">
                    <SummaryRow icon={<Megaphone className="size-4 text-neutral-500" />} label="Campaign Name" val={name || "To be added"} />
                    <SummaryRow icon={<FileText className="size-4 text-[#16A34A]" />} label="Campaign Type" badge={selectedCampaignOption.title} />
                    <SummaryRow icon={<CalendarDays className="size-4 text-neutral-500" />} label="Duration" val="25 Aug 2025 - 15 Sep 2025" />
                    <SummaryRow icon={<Gift className="size-4 text-neutral-500" />} label="Rewards" val="To be added" />
                    <SummaryRow icon={<Tag className="size-4 text-neutral-500" />} label="Coupons" val="To be added" />
                    <SummaryRow icon={<ShieldCheck className="size-4 text-neutral-500" />} label="Status" badge="Draft" />

                    <div className="pt-4 border-t border-neutral-100 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-neutral-700">
                        <span>Campaign Completion Score</span>
                        <span>{score}%</span>
                      </div>
                      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#16A34A] rounded-full transition-all duration-500" style={{ width: `${score}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Reach / Improvement checklist */}
                  <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-5 space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Estimated Reach</p>
                      <p className="text-lg font-black text-neutral-950 mt-1">350–500 Customers</p>
                      <p className="text-[10px] text-neutral-400 leading-normal mt-0.5">Based on campaign optimization checklist criteria.</p>
                    </div>

                    <div className="h-px bg-neutral-100" />

                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Recommended checklist</p>
                      <div className="space-y-2">
                        <CheckItem checked={name.trim().length > 3} text="Optimal campaign name" />
                        <CheckItem checked={description.trim().length > 10} text="Add a stronger description" />
                        <CheckItem checked={!!bannerUrl} text="Upload a high-quality banner" />
                        <CheckItem checked={prizes.length > 0} text="Add campaign rewards" />
                        <CheckItem checked={startsAt !== endsAt} text="Duration period configured" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2 Layout (Campaign Type Redesign) */}
            {step === 2 && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-2 space-y-6">
                  <div>
                    <h2 className="text-xl font-black text-neutral-900 tracking-tight">Select Campaign Type</h2>
                    <p className="text-sm text-neutral-500 mt-1">Choose the engagement experience you want to run.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {CAMPAIGN_TYPES.map((option) => {
                      const isSelected = selectedType === option.id;
                      return (
                        <div
                          key={option.id}
                          onClick={() => setSelectedType(option.id)}
                          className={`relative bg-white rounded-3xl border-2 p-5 flex flex-col gap-4 cursor-pointer hover:-translate-y-1 hover:shadow-lg transition-all duration-200 group ${isSelected
                              ? "border-[#16A34A] bg-[#DCFCE7]/10"
                              : "border-neutral-200 hover:border-neutral-300 shadow-sm"
                            }`}
                        >
                          <div className="absolute top-4 right-4 flex items-center justify-center size-5 rounded-full border border-neutral-300 group-hover:border-neutral-400">
                            {isSelected && (
                              <div className="size-3 rounded-full bg-[#16A34A] animate-scale-up" />
                            )}
                          </div>

                          <div className={`h-28 rounded-2xl flex items-center justify-center overflow-hidden transition-colors ${isSelected ? "bg-[#DCFCE7]/30" : "bg-neutral-50"
                            }`}>
                            <CampaignIllustration type={option.id} isSelected={isSelected} />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-black text-neutral-900 text-base">{option.title}</h3>
                              {option.badge && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#DCFCE7] text-[#166534]">
                                  {option.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-500 leading-relaxed line-clamp-2">
                              {option.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                            {option.benefits.map((b) => (
                              <span key={b} className="inline-flex items-center gap-1 text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded-md px-2 py-0.5 border border-neutral-200/50">
                                <span className="size-1 rounded-full bg-neutral-400" />
                                {b}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="bg-[#DCFCE7]/35 border border-[#16A34A]/20 rounded-2xl p-4 flex gap-3.5 items-start">
                    <div className="flex items-center justify-center size-8 rounded-xl bg-[#DCFCE7] text-[#166534] font-black shrink-0 shadow-sm">
                      💡
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#166534]">Not sure which campaign to choose?</p>
                      <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                        <strong>Scratch & Win</strong> is highly recommended for retail and offline stores because it replicates the thrill of scratch coupons. It delivers instant rewards, resulting in 3x more scans compared to static loyalty codes.
                      </p>
                    </div>
                  </div>
                </div>

                <aside className="lg:sticky lg:top-24 bg-white rounded-3xl border border-neutral-200 shadow-sm p-6 space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center size-10 rounded-2xl bg-[#DCFCE7] text-[#166534]">
                        <Sparkles className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-black text-neutral-900 text-sm">About {selectedCampaignOption.title}</h3>
                        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-0.5">Campaign Details</p>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500 leading-relaxed">
                      {selectedCampaignOption.description}
                    </p>
                  </div>

                  <div className="h-px bg-neutral-100" />

                  <div className="space-y-4">
                    <InfoRow label="How it works" value={selectedCampaignOption.howItWorks} />
                    <InfoRow label="Best for" value={selectedCampaignOption.bestFor} />
                    <InfoRow label="Engagement Level" value={"⭐".repeat(selectedCampaignOption.engagement)} />
                    <InfoRow label="Setup Time" value={selectedCampaignOption.setupTime} icon={<Clock className="size-3.5" />} />
                    <InfoRow label="Est. Conversion" value={selectedCampaignOption.conversion} />
                    <InfoRow label="Recommended for" value={selectedCampaignOption.industries.join(", ")} />
                  </div>

                  <div className="h-px bg-neutral-100" />

                  <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">💡 Success Tip</p>
                    <p className="text-xs text-neutral-600 font-semibold mt-1.5 leading-relaxed">
                      {selectedCampaignOption.successTip}
                    </p>
                  </div>

                  <div className="bg-[#DCFCE7]/20 border border-[#16A34A]/10 rounded-2xl p-4 flex gap-2">
                    <CheckCircle2 className="size-4.5 text-[#16A34A] shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-neutral-900">Secured & Fair</p>
                      <p className="text-[10px] text-neutral-500 mt-0.5">All game logic is fully secure and verified on the server side.</p>
                    </div>
                  </div>
                </aside>
              </div>
            )}

            {/* ── Step 3: Rewards ── */}
            {step === 3 && (
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 md:p-8 max-w-2xl mx-auto space-y-5">
                <StepHeader icon={Gift} title="Rewards & Prizes" sub="Define what rewards players can win." />
                <div className="space-y-4">
                  {prizes.map((prize, i) => (
                    <div key={i} className="bg-neutral-50 rounded-2xl border border-neutral-200 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wide">Prize Option {i + 1}</span>
                        {prizes.length > 1 && (
                          <button
                            onClick={() => removePrize(i)}
                            className="text-red-400 hover:text-red-600 transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                      <Field label="Prize Name *">
                        <input
                          type="text"
                          value={prize.name}
                          onChange={(e) => updatePrize(i, "name", e.target.value)}
                          placeholder="e.g. 10% OFF Coupon"
                          className={inputCls}
                        />
                      </Field>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Prize Type *">
                          <select
                            value={prize.prize_type}
                            onChange={(e) => {
                              const nextType = e.target.value as PrizeType;
                              updatePrize(i, "prize_type", nextType);
                              // Clear value when switching to a type that has none.
                              if (!PRIZE_TYPES.find((t) => t.id === nextType)?.hasValue) {
                                updatePrize(i, "prize_value", null as any);
                              }
                            }}
                            className={inputCls}
                          >
                            {PRIZE_TYPES.map((t) => (
                              <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                          </select>
                        </Field>
                        {PRIZE_TYPES.find((t) => t.id === prize.prize_type)?.hasValue && (
                          <Field label={prize.prize_type === "wallet_points" ? "Points" : "Value (₹)"}>
                            <input
                              type="number"
                              min={0}
                              value={prize.prize_value ?? ""}
                              onChange={(e) =>
                                updatePrize(i, "prize_value", e.target.value === "" ? (null as any) : Number(e.target.value))
                              }
                              placeholder={prize.prize_type === "wallet_points" ? "e.g. 100" : "e.g. 250"}
                              className={inputCls}
                            />
                          </Field>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 -mt-1">
                        {PRIZE_TYPES.find((t) => t.id === prize.prize_type)?.hint}
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        <Field label="Quantity">
                          <input type="number" min={1} value={prize.total_quantity}
                            onChange={(e) => updatePrize(i, "total_quantity", Number(e.target.value))}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Win Chance (Weight)">
                          <input type="number" min={0} value={prize.weight}
                            onChange={(e) => updatePrize(i, "weight", Number(e.target.value))}
                            className={inputCls}
                          />
                        </Field>
                        <Field label="Expiry Days">
                          <input type="number" min={1} value={prize.expiry_days}
                            onChange={(e) => updatePrize(i, "expiry_days", Number(e.target.value))}
                            className={inputCls}
                          />
                        </Field>
                      </div>
                      <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={prize.is_fallback}
                          onChange={(e) => setFallback(i, e.target.checked)}
                          className="mt-0.5 size-4 rounded border-neutral-300 text-[#16A34A] focus:ring-[#16A34A]/20 cursor-pointer"
                        />
                        <span className="text-[11px] leading-snug">
                          <span className="font-bold text-neutral-700">Use as fallback prize</span>
                          <span className="block text-neutral-400">
                            Awarded automatically when other prizes run out of stock. Only one prize per campaign can be the fallback.
                          </span>
                        </span>
                      </label>
                    </div>
                  ))}
                  {prizes.length < 8 && (
                    <button onClick={addPrize} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#16A34A] hover:text-[#15803D]">
                      <Plus className="size-3.5" />
                      Add another prize
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 4: Coupons ── */}
            {step === 4 && (
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 md:p-8 max-w-2xl mx-auto space-y-5">
                <StepHeader icon={Tag} title="Coupon Settings" sub="Customize coupon prefixes." />
                <Field label="Coupon Prefix *">
                  <input
                    type="text"
                    value={couponPrefix}
                    onChange={(e) => setCouponPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                    placeholder="e.g. SINDUR"
                    className={inputCls}
                    maxLength={10}
                  />
                </Field>
                <div className="bg-neutral-900 rounded-2xl p-6 text-center">
                  <p className="text-xs text-white/40 mb-2 font-bold uppercase tracking-wider">Sample Code Output</p>
                  <p className="text-3xl font-black text-white tracking-widest">{couponPrefix || "WIN"}-A8B9</p>
                </div>

                {selectedType === "coupon_drop" && (
                  <div className="space-y-5 border-t border-neutral-200 pt-6">
                    <StepHeader
                      icon={Tag}
                      title="Shopify Discount Rules"
                      sub="Each winner gets a unique Shopify discount code with these rules."
                    />

                    <Field label="Win Mode">
                      <select
                        value={couponRules.win_mode}
                        onChange={(e) =>
                          setCouponRules({ ...couponRules, win_mode: e.target.value as CouponRules["win_mode"] })
                        }
                        className={inputCls}
                      >
                        <option value="weighted">Weighted draw (win / lose by prize odds)</option>
                        <option value="always">Everyone wins a code</option>
                      </select>
                    </Field>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Discount Type *">
                        <select
                          value={couponRules.discount_type}
                          onChange={(e) =>
                            setCouponRules({
                              ...couponRules,
                              discount_type: e.target.value as CouponRules["discount_type"],
                            })
                          }
                          className={inputCls}
                        >
                          <option value="percentage">Percentage off</option>
                          <option value="fixed_amount">Fixed amount off</option>
                        </select>
                      </Field>
                      <Field
                        label={couponRules.discount_type === "percentage" ? "Percent Off * (%)" : "Amount Off *"}
                      >
                        <input
                          type="number"
                          min={0}
                          value={couponRules.discount_value}
                          onChange={(e) =>
                            setCouponRules({ ...couponRules, discount_value: Number(e.target.value) })
                          }
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Minimum Order (optional)">
                        <input
                          type="number"
                          min={0}
                          value={couponRules.minimum_subtotal ?? ""}
                          onChange={(e) =>
                            setCouponRules({
                              ...couponRules,
                              minimum_subtotal: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          placeholder="No minimum"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Uses Per Code (optional)">
                        <input
                          type="number"
                          min={1}
                          value={couponRules.usage_limit ?? ""}
                          onChange={(e) =>
                            setCouponRules({
                              ...couponRules,
                              usage_limit: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          placeholder="Unlimited"
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Code Expiry (days)">
                        <input
                          type="number"
                          min={1}
                          value={couponRules.expiry_days ?? ""}
                          onChange={(e) =>
                            setCouponRules({
                              ...couponRules,
                              expiry_days: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          placeholder="Follows campaign end"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Currency">
                        <input
                          type="text"
                          value={couponRules.currency}
                          onChange={(e) =>
                            setCouponRules({
                              ...couponRules,
                              currency: e.target.value.toUpperCase().slice(0, 3),
                            })
                          }
                          className={inputCls}
                          maxLength={3}
                        />
                      </Field>
                    </div>

                    <label className="flex items-center gap-3 text-sm font-semibold text-neutral-700">
                      <input
                        type="checkbox"
                        checked={couponRules.applies_once_per_customer}
                        onChange={(e) =>
                          setCouponRules({ ...couponRules, applies_once_per_customer: e.target.checked })
                        }
                        className="size-4 rounded border-neutral-300"
                      />
                      Limit to one use per customer
                    </label>

                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Codes to Pre-generate">
                        <input
                          type="number"
                          min={1}
                          value={couponRules.pool_target}
                          onChange={(e) =>
                            setCouponRules({ ...couponRules, pool_target: Number(e.target.value) })
                          }
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Auto-refill When Below">
                        <input
                          type="number"
                          min={0}
                          value={couponRules.pool_low_watermark}
                          onChange={(e) =>
                            setCouponRules({ ...couponRules, pool_low_watermark: Number(e.target.value) })
                          }
                          className={inputCls}
                        />
                      </Field>
                    </div>

                    <p className="text-xs text-neutral-500">
                      Codes are minted in Shopify when you activate the campaign. This requires the
                      <span className="font-semibold"> write_discounts</span> permission on your connected store.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 5: Duration ── */}
            {step === 5 && (
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 md:p-8 max-w-2xl mx-auto space-y-5">
                <StepHeader icon={CalendarDays} title="Duration" sub="Define the start and end dates." />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Start Date *">
                    <input type="date" value={startsAt} min={todayISO()}
                      onChange={(e) => setStartsAt(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="End Date *">
                    <input type="date" value={endsAt} min={startsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* ── Step 6: Review ── */}
            {step === 6 && (
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 md:p-8 max-w-2xl mx-auto space-y-6">
                <StepHeader icon={Rocket} title="Review & Publish" sub="Please review details before saving." />
                {serverError && (
                  <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>{serverError}</span>
                  </div>
                )}
                <div className="space-y-4">
                  <ReviewRow label="Name" value={name} />
                  <ReviewRow label="Headline" value={headline} />
                  <ReviewRow label="Selected Game" value={selectedCampaignOption.title} />
                  <ReviewRow label="Coupon Prefix" value={`${couponPrefix}-XXXX`} />
                  <ReviewRow label="Starts" value={startsAt} />
                  <ReviewRow label="Ends" value={endsAt} />
                </div>
                <p className="text-xs text-neutral-500">
                  Publishing makes the campaign live immediately (or scheduled if the start date is in the future). Save as draft to keep editing before it goes live.
                </p>
              </div>
            )}

            {/* Bottom Full-Width Banner Banner */}
            <div className="mt-8 bg-emerald-50 border border-emerald-100 rounded-3xl p-5 flex items-center gap-4">
              <div className="flex items-center justify-center size-12 rounded-2xl bg-[#DCFCE7] text-xl shrink-0">
                🏆
              </div>
              <div className="text-left">
                <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wider">You're creating something awesome!</h4>
                <p className="text-xs text-neutral-500 mt-0.5">Engaging campaigns bring customers back to your store and increase repeat sales.</p>
              </div>
            </div>

            {/* ── Actions Bar ── */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-200">
              <button
                onClick={back}
                disabled={step === 1 || isPending}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 bg-white border border-neutral-200 text-neutral-700 rounded-xl hover:bg-neutral-50 transition-colors disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="size-3.5" />
                Back
              </button>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => publish(true)}
                  disabled={isPending}
                  className="text-xs font-bold text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save as Draft
                </button>
                {step === 6 ? (
                  <button
                    onClick={() => publish(false)}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold px-6 py-2.5 rounded-full transition-colors shadow-lg shadow-green-500/20 cursor-pointer disabled:opacity-60"
                  >
                    {isPending ? (
                      <><Loader2 className="size-3.5 animate-spin" /> Saving...</>
                    ) : (
                      <>
                        Save & Publish
                        <ChevronRight className="size-3.5" />
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={next}
                    disabled={step === 1 && (!name.trim() || !description.trim() || !bannerUrl)}
                    className="inline-flex items-center gap-1 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold px-6 py-2.5 rounded-full transition-colors shadow-lg shadow-green-500/20 cursor-pointer disabled:opacity-50"
                  >
                    Save & Continue
                    <ChevronRight className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ── Custom SVG Illustrations ── */
function CampaignIllustration({ type, isSelected }: { type: CampaignType; isSelected: boolean }) {
  const primaryColor = isSelected ? "#16A34A" : "#6B7280";
  const lightBg = isSelected ? "#DCFCE7" : "#F3F4F6";

  switch (type) {
    case "scratch_win":
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
          <rect x="5" y="10" width="50" height="40" rx="8" fill={lightBg} stroke={primaryColor} strokeWidth="2" />
          <path d="M15 22h30" stroke={primaryColor} strokeWidth="2" strokeDasharray="3 3" />
          <path d="M15 30h30" stroke={primaryColor} strokeWidth="2" strokeDasharray="3 3" />
          <path d="M15 38h20" stroke={primaryColor} strokeWidth="2" strokeDasharray="3 3" />
          <circle cx="45" cy="35" r="10" fill={primaryColor} />
          <path d="M45 31v8M41 35h8" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "spin_win":
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" className={isSelected ? "animate-spin-slow" : ""}>
          <circle cx="30" cy="30" r="22" fill={lightBg} stroke={primaryColor} strokeWidth="2" />
          <path d="M30 8v44M8 30h44M14.5 14.5l31 31M14.5 45.5l31-31" stroke={primaryColor} strokeWidth="1.5" />
          <circle cx="30" cy="30" r="5" fill={primaryColor} />
        </svg>
      );
    case "lucky_draw":
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
          <path d="M10 20h40v25H10z" fill={lightBg} stroke={primaryColor} strokeWidth="2" />
          <path d="M10 20l20-10 20 10" stroke={primaryColor} strokeWidth="2" strokeLinejoin="round" />
          <rect x="22" y="18" width="16" height="24" rx="3" transform="rotate(15 30 30)" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <circle cx="28" cy="27" r="1.5" fill={primaryColor} />
          <circle cx="32" cy="32" r="1.5" fill={primaryColor} />
        </svg>
      );
    case "quiz_challenge":
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
          <rect x="12" y="10" width="36" height="40" rx="6" fill={lightBg} stroke={primaryColor} strokeWidth="2" />
          <rect x="18" y="18" width="6" height="6" rx="1.5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <path d="M20 21l1 1 2-2" stroke={primaryColor} strokeWidth="1.5" strokeLinecap="round" />
          <rect x="18" y="28" width="6" height="6" rx="1.5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <rect x="18" y="38" width="6" height="6" rx="1.5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <path d="M28 21h12M28 31h12M28 41h8" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "collect_win":
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
          <rect x="10" y="10" width="40" height="40" rx="8" fill={lightBg} stroke={primaryColor} strokeWidth="2" />
          <circle cx="20" cy="20" r="5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <path d="M20 18v4M18 20h4" stroke={primaryColor} strokeWidth="1" />
          <circle cx="30" cy="20" r="5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <circle cx="40" cy="20" r="5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <circle cx="20" cy="30" r="5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <circle cx="30" cy="30" r="5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <circle cx="40" cy="30" r="5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <circle cx="20" cy="40" r="5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <circle cx="30" cy="40" r="5" fill="white" stroke={primaryColor} strokeWidth="1.5" />
          <circle cx="40" cy="40" r="5" fill={primaryColor} />
        </svg>
      );
    case "coupon_drop":
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
          <rect x="8" y="18" width="44" height="24" rx="4" transform="rotate(-10 30 30)" fill={lightBg} stroke={primaryColor} strokeWidth="2" />
          <circle cx="10" cy="28" r="3" fill="#F8FAFC" stroke={primaryColor} strokeWidth="2" />
          <circle cx="50" cy="21" r="3" fill="#F8FAFC" stroke={primaryColor} strokeWidth="2" />
          <path d="M26 23h2M32 29h2" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" />
          <path d="M32 22l-6 8" stroke={primaryColor} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

/* ── UI Helpers ─── */
const inputCls =
  "w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-neutral-700">{label}</label>
      {children}
    </div>
  );
}

function StepHeader({
  icon: Icon,
  title,
  sub,
}: {
  icon: React.ElementType;
  title: string;
  sub: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="flex items-center justify-center size-8 rounded-xl bg-emerald-50">
          <Icon className="size-4.5 text-emerald-600" />
        </div>
        <h2 className="text-lg font-black text-neutral-900">{title}</h2>
      </div>
      <p className="text-sm text-neutral-500 ml-11">{sub}</p>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-neutral-100">
      <span className="text-xs font-bold text-neutral-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-neutral-900">{value || "—"}</span>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="space-y-1 flex flex-col items-start text-left">
      <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{label}</span>
      <div className="flex items-center gap-1.5 text-xs text-neutral-700 font-semibold leading-relaxed">
        {icon}
        <span>{value}</span>
      </div>
    </div>
  );
}

function PreviewInfoRow({ emoji, label, val }: { emoji: string; label: string; val: string }) {
  return (
    <div className="flex items-center gap-2 bg-white/70 border border-neutral-200/50 rounded-xl px-2.5 py-1.5 select-none shadow-sm">
      <span className="text-xs">{emoji}</span>
      <div className="text-[9px] text-left">
        <span className="block text-[8px] font-bold text-neutral-400 uppercase tracking-wider leading-none">{label}</span>
        <span className="block text-neutral-800 font-bold mt-0.5 leading-none truncate max-w-[130px]">{val}</span>
      </div>
    </div>
  );
}

function SummaryRow({ icon, label, val, badge }: { icon: React.ReactNode; label: string; val?: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <div className="flex items-center gap-2 text-neutral-500 font-semibold">
        {icon}
        <span>{label}</span>
      </div>
      {badge ? (
        <span className="font-bold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-full border border-[#16A34A]/10 text-[10px]">
          {badge}
        </span>
      ) : (
        <span className="font-bold text-neutral-800 truncate max-w-[110px]">{val}</span>
      )}
    </div>
  );
}

function CheckItem({ checked, text }: { checked: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {checked ? (
        <CheckCircle2 className="size-4 text-[#16A34A] shrink-0" />
      ) : (
        <div className="size-4 rounded-full border border-neutral-200 shrink-0" />
      )}
      <span className={`font-semibold ${checked ? "text-neutral-500 line-through" : "text-neutral-700"}`}>
        {text}
      </span>
    </div>
  );
}
