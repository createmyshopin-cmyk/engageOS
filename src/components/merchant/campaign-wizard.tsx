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
  Copy,
  Link2,
  Globe,
  Radio,
  Ticket,
  Package,
} from "lucide-react";
import { createCampaignAction } from "@/app/m/campaigns/actions";
import { slugify } from "@/lib/validation";
import {
  formatBytes,
  processCampaignBanner,
  processCampaignLogo,
} from "@/lib/images/process-campaign-images";

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
  // Per-tier Coupon Drop discount (only meaningful for coupon prizes on a
  // coupon_drop campaign). Each tier mints its own Shopify discount at this rate.
  discount_type: "percentage" | "fixed_amount" | null;
  discount_value: number | null;
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
type WizardStepKey = "type" | "basic" | "rewards" | "coupons" | "settings" | "duration" | "preview";

const STEP_META: Record<WizardStepKey, { label: string; sub: string }> = {
  type: { label: "Campaign Type", sub: "Select game type" },
  basic: { label: "Basic Info", sub: "Campaign details" },
  rewards: { label: "Rewards", sub: "Add prizes & coupons" },
  coupons: { label: "Coupons", sub: "Upload or generate" },
  settings: { label: "Settings", sub: "Coupon & discount rules" },
  duration: { label: "Duration", sub: "Set campaign period" },
  preview: { label: "Preview", sub: "Review & publish" },
};

const STANDARD_FLOW: WizardStepKey[] = ["type", "basic", "rewards", "coupons", "duration", "preview"];
const COUPON_DROP_FLOW: WizardStepKey[] = ["type", "basic", "settings", "preview"];

function getWizardFlow(campaignType: CampaignType): WizardStepKey[] {
  return campaignType === "coupon_drop" ? COUPON_DROP_FLOW : STANDARD_FLOW;
}

function buildCouponDropDefaultPrize(rules: CouponRules): PrizeRow {
  const label =
    rules.discount_type === "percentage"
      ? `${rules.discount_value}% OFF Coupon`
      : `₹${rules.discount_value} OFF Coupon`;
  return {
    name: label,
    weight: 100,
    total_quantity: rules.pool_target,
    expiry_days: rules.expiry_days ?? 30,
    prize_type: "coupon",
    prize_value: null,
    discount_type: rules.discount_type,
    discount_value: rules.discount_value,
    is_fallback: false,
  };
}

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
  {
    name: "10% OFF Coupon",
    weight: 100,
    total_quantity: 100,
    expiry_days: 30,
    prize_type: "coupon",
    prize_value: null,
    discount_type: "percentage",
    discount_value: 10,
    is_fallback: false,
  },
  {
    name: "Gift Hamper",
    weight: 150,
    total_quantity: 150,
    expiry_days: 30,
    prize_type: "physical_gift",
    prize_value: null,
    discount_type: null,
    discount_value: null,
    is_fallback: false,
  },
];

const DEFAULT_BANNER = "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=80";
const DEFAULT_LOGO = "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?auto=format&fit=crop&w=200&h=200&q=80";

const SMART_TIPS = [
  "A clear banner and description increases customer participation by up to 3x.",
  "Adding a high-value grand prize creates organic buzz among local shoppers.",
  "Short and clear descriptions convert passive viewers into active scratchers.",
  "Keep your logo high contrast to build brand recognition on customer receipt scans.",
];

function formatShortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function sourceSlugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function isValidCampaignSlug(value: string): boolean {
  return /^[a-z0-9-]{2,40}$/.test(value);
}

function isValidSourceSlug(value: string): boolean {
  return /^[a-z0-9_-]{1,40}$/.test(value);
}

export function CampaignWizard({
  shopifyConnected,
  merchantSlug,
  baseUrl,
}: {
  shopifyConnected: boolean;
  merchantSlug: string;
  baseUrl: string;
}) {
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
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [bannerMeta, setBannerMeta] = useState<{ originalBytes: number; bannerBytes: number } | null>(
    null
  );
  const [bannerProcessing, setBannerProcessing] = useState(false);
  const [logoProcessing, setLogoProcessing] = useState(false);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO);
  const [headline, setHeadline] = useState("Scratch & Win this Onam! 🎁");
  const [terms, setTerms] = useState("1. One scratch card per customer.\n2. Coupons valid for 30 days.");
  const [couponPrefix, setCouponPrefix] = useState("SINDUR");
  const [campaignSlug, setCampaignSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [addSourceUrl, setAddSourceUrl] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceSlug, setSourceSlug] = useState("");
  const [sourceSlugTouched, setSourceSlugTouched] = useState(false);
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEndsAt] = useState(futureISO(30));
  const [prizes, setPrizes] = useState<PrizeRow[]>(DEFAULT_PRIZES);
  const [quickAddType, setQuickAddType] = useState<"coupon" | "physical_gift">("coupon");

  // Coupon Drop discount rules (only sent when selectedType === 'coupon_drop').
  const [couponRules, setCouponRules] = useState<CouponRules>(DEFAULT_COUPON_RULES);

  // Custom UI state
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!slugTouched) {
      setCampaignSlug(slugify(name));
    }
  }, [name, slugTouched]);

  useEffect(() => {
    if (addSourceUrl && !sourceSlugTouched) {
      setSourceSlug(sourceSlugify(sourceLabel || name || "direct"));
    }
  }, [addSourceUrl, sourceLabel, name, sourceSlugTouched]);

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

  const resolvedCampaignSlug = campaignSlug.trim() || slugify(name) || "campaign";

  // Calculate completion percentage
  const calculateScore = () => {
    let score = 0;
    if (name.trim().length > 3) score += 15;
    if (description.trim().length > 10) score += 15;
    if (isValidCampaignSlug(resolvedCampaignSlug)) score += 15;
    if (bannerUrl) score += 20;
    if (logoUrl) score += 10;
    if (prizes.length > 0) score += 10;
    if (couponPrefix) score += 5;
    if (startsAt !== endsAt) score += 10;
    return Math.min(score, 100);
  };

  const score = calculateScore();

  const playUrl = `${baseUrl}/c/${merchantSlug}/${resolvedCampaignSlug}`;
  const resolvedSourceSlug = sourceSlugTouched
    ? sourceSlug.trim().toLowerCase()
    : sourceSlugify(sourceLabel || name || "direct");
  const trackedSourceUrl =
    addSourceUrl && resolvedSourceSlug ? `${playUrl}?src=${resolvedSourceSlug}` : null;

  const selectedCampaignOption = CAMPAIGN_TYPES.find((t) => t.id === selectedType)!;
  const availableCampaignTypes = CAMPAIGN_TYPES.filter(
    (type) => type.id !== "coupon_drop" || shopifyConnected
  );
  const flow = getWizardFlow(selectedType);
  const currentStepKey = flow[step - 1] ?? "type";
  const isLastStep = step === flow.length;
  const nextStepKey = flow[step];
  const continueLabel = nextStepKey ? `Continue to ${STEP_META[nextStepKey].label}` : "Save & Continue";

  useEffect(() => {
    if (!shopifyConnected && selectedType === "coupon_drop") {
      setSelectedType("scratch_win");
    }
  }, [shopifyConnected, selectedType]);

  useEffect(() => {
    setStep((s) => Math.min(s, flow.length));
  }, [flow.length]);

  function updatePrize(index: number, field: keyof PrizeRow, value: string | number) {
    const updated = [...prizes];
    updated[index] = { ...updated[index], [field]: value } as PrizeRow;
    setPrizes(updated);
  }

  function addPrize() {
    const template: PrizeRow =
      quickAddType === "physical_gift"
        ? {
            name: "",
            weight: 50,
            total_quantity: 50,
            expiry_days: 30,
            prize_type: "physical_gift",
            prize_value: null,
            discount_type: null,
            discount_value: null,
            is_fallback: false,
          }
        : {
            name: "",
            weight: 50,
            total_quantity: 100,
            expiry_days: 30,
            prize_type: "coupon",
            prize_value: null,
            discount_type: "percentage",
            discount_value: 10,
            is_fallback: false,
          };
    setPrizes([...prizes, template]);
  }

  function removePrize(index: number) {
    setPrizes(prizes.filter((_, i) => i !== index));
  }

  /** Only one prize may be the fallback; setting one clears the others. */
  function setFallback(index: number, value: boolean) {
    setPrizes(prizes.map((p, i) => ({ ...p, is_fallback: i === index ? value : value ? false : p.is_fallback })));
  }

  function next() {
    if (currentStepKey === "basic") {
      if (!name.trim()) return;
      if (!description.trim()) return;
      if (!bannerUrl) return;
      if (!isValidCampaignSlug(resolvedCampaignSlug)) return;
      if (addSourceUrl) {
        if (!sourceLabel.trim()) return;
        if (!isValidSourceSlug(resolvedSourceSlug)) return;
      }
    }
    if (currentStepKey === "settings") {
      if (!couponPrefix.trim()) return;
      if (couponRules.discount_value <= 0) return;
      if (startsAt >= endsAt) return;
    }
    setStep((s) => Math.min(s + 1, flow.length));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 1));
  }

  function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      alert("Please select a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be 10 MB or smaller.");
      return;
    }

    setBannerProcessing(true);
    void processCampaignBanner(file)
      .then((result) => {
        setBannerUrl(result.bannerDataUrl);
        setOgImageUrl(result.ogImageDataUrl);
        setBannerMeta({
          originalBytes: result.originalBytes,
          bannerBytes: result.bannerBytes,
        });
      })
      .catch(() => {
        alert("Failed to process image. Try another file.");
      })
      .finally(() => {
        setBannerProcessing(false);
      });
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      alert("Please select a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Logo must be 5 MB or smaller.");
      return;
    }

    setLogoProcessing(true);
    void processCampaignLogo(file)
      .then((result) => {
        setLogoUrl(result.logoDataUrl);
      })
      .catch(() => {
        alert("Failed to process logo. Try another file.");
      })
      .finally(() => {
        setLogoProcessing(false);
      });
  }

  function clearBanner() {
    setBannerUrl("");
    setOgImageUrl("");
    setBannerMeta(null);
  }

  function publish(asDraft = false) {
    setServerError(null);
    const prizesToSubmit =
      selectedType === "coupon_drop" ? [buildCouponDropDefaultPrize(couponRules)] : prizes;
    startTransition(async () => {
      const result = await createCampaignAction(undefined as any, {
        name,
        headline,
        description,
        banner_url: bannerUrl,
        og_image_url: ogImageUrl || undefined,
        logo_url: logoUrl,
        terms,
        coupon_prefix: couponPrefix,
        starts_at: new Date(startsAt),
        ends_at: new Date(endsAt),
        prizes: prizesToSubmit,
        campaign_type: selectedType,
        slug: resolvedCampaignSlug,
        source_label: addSourceUrl ? sourceLabel.trim() : undefined,
        source_slug: addSourceUrl ? resolvedSourceSlug : undefined,
        coupon_rules: selectedType === "coupon_drop" ? couponRules : undefined,
        publish: !asDraft,
      });
      if (result.error) {
        setServerError(result.error);
        setStep(flow.length);
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
          {flow.map((key, index) => {
            const stepNum = index + 1;
            const meta = STEP_META[key];
            const done = step > stepNum;
            const current = step === stepNum;
            return (
              <div key={key} className="flex items-center gap-3 flex-1 min-w-[140px] last:flex-none">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center justify-center size-7 rounded-full text-xs font-black transition-all ${done
                        ? "bg-[#16A34A] text-white"
                        : current
                          ? "bg-neutral-900 text-white ring-4 ring-neutral-900/10"
                          : "bg-neutral-100 text-neutral-400"
                      }`}
                  >
                    {done ? <Check className="size-4" /> : stepNum}
                  </div>
                  <div>
                    <span className={`block text-xs font-bold ${current ? "text-neutral-900" : "text-neutral-400"}`}>
                      {meta.label}
                    </span>
                    <span className="block text-[10px] text-neutral-400 leading-tight">
                      {done ? "Completed" : meta.sub}
                    </span>
                  </div>
                </div>
                {stepNum < flow.length && (
                  <div className="h-px bg-neutral-200 flex-1 hidden md:block" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Main Layout ── */}
      <main className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            {/* STEP: Campaign Type */}
            {currentStepKey === "type" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                <div className="lg:col-span-2 space-y-6">
                  <div>
                    <h2 className="text-xl font-black text-neutral-900 tracking-tight">Select Campaign Type</h2>
                    <p className="text-sm text-neutral-500 mt-1">Choose the engagement experience you want to run.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {availableCampaignTypes.map((option) => {
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

            {/* STEP: Basic Info */}
            {currentStepKey === "basic" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Column 1: Form (lg:col-span-5) */}
                <div className="lg:col-span-5 bg-white rounded-3xl border border-neutral-200 shadow-sm p-6 space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center size-10 rounded-2xl bg-[#F0FDF4] border border-[#DCFCE7] shrink-0">
                      <FileText className="size-5 text-[#16A34A]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-neutral-900 tracking-tight">Basic Information</h2>
                      <p className="text-xs text-neutral-500 mt-0.5">Enter the basic details of your campaign.</p>
                    </div>
                  </div>

                  <ValidatedTextInput
                    label="Campaign Name"
                    required
                    value={name}
                    onChange={(v) => setName(v.slice(0, 60))}
                    placeholder="e.g. Onam Mega Scratch & Win"
                    maxLength={60}
                    valid={name.trim().length > 3}
                  />

                  <ValidatedTextarea
                    label="Short Description"
                    required
                    value={description}
                    onChange={(v) => setDescription(v.slice(0, 120))}
                    placeholder="Describe the campaign briefly..."
                    maxLength={120}
                    rows={3}
                    valid={description.trim().length > 10}
                  />

                  {/* Campaign URL */}
                  <div className="space-y-3 rounded-2xl border border-[#BFDBFE] bg-gradient-to-br from-[#EFF6FF] to-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center size-8 rounded-xl bg-white border border-[#BFDBFE] shadow-sm">
                          <Link2 className="size-4 text-[#2563EB]" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-neutral-900">Campaign URL</p>
                          <p className="text-[10px] text-neutral-500">Auto-generated from name — switch to custom to edit.</p>
                        </div>
                      </div>
                      <ModeToggle
                        mode={slugTouched ? "manual" : "auto"}
                        onAuto={() => {
                          setSlugTouched(false);
                          setCampaignSlug(slugify(name));
                        }}
                        onManual={() => setSlugTouched(true)}
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-bold text-neutral-700">URL slug *</label>
                      <div className="flex items-center overflow-hidden rounded-xl border border-[#BFDBFE] bg-white focus-within:border-[#3B82F6] focus-within:ring-2 focus-within:ring-[#DBEAFE]">
                        <span className="shrink-0 border-r border-[#E5E7EB] bg-neutral-50 px-3 py-2.5 text-[11px] font-bold text-neutral-500">
                          /c/{merchantSlug}/
                        </span>
                        <input
                          type="text"
                          value={slugTouched ? campaignSlug : slugify(name)}
                          onChange={(e) => {
                            setSlugTouched(true);
                            setCampaignSlug(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, "-")
                                .replace(/-+/g, "-")
                                .slice(0, 40)
                            );
                          }}
                          readOnly={!slugTouched}
                          placeholder="onam-mega-scratch-win"
                          className={`w-full bg-transparent px-3 py-2.5 text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none ${
                            !slugTouched ? "text-neutral-500 cursor-default" : ""
                          }`}
                          aria-label="Campaign URL slug"
                        />
                        {isValidCampaignSlug(resolvedCampaignSlug) && (
                          <CheckCircle2 className="mr-3 size-4 shrink-0 text-[#16A34A]" />
                        )}
                      </div>
                      {!isValidCampaignSlug(resolvedCampaignSlug) && (
                        <p className="mt-1.5 text-[10px] font-bold text-red-600">
                          Use 2–40 lowercase letters, numbers, or hyphens.
                        </p>
                      )}
                    </div>

                    <UrlPreviewRow label="Share link" url={playUrl} variant="blue" />
                  </div>

                  {/* Tracking source URL */}
                  <div
                    className={`rounded-2xl border p-4 transition-colors ${
                      addSourceUrl ? "border-[#E9D5FF] bg-gradient-to-br from-[#FAF5FF] to-white" : "border-neutral-200 bg-neutral-50/50"
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={addSourceUrl}
                        onChange={(e) => {
                          setAddSourceUrl(e.target.checked);
                          if (e.target.checked && !sourceLabel.trim()) {
                            setSourceLabel(`${name.trim() || "Campaign"} Link`);
                          }
                        }}
                        className="mt-0.5 size-4 rounded border-neutral-300 text-[#7C3AED] focus:ring-[#7C3AED]/20"
                      />
                      <span className="flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-black text-neutral-900">Tracking source URL</span>
                          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-neutral-600">
                            Optional
                          </span>
                        </span>
                        <span className="block text-[10px] text-neutral-500 mt-0.5">
                          Track where scans come from with a <span className="font-mono">?src=</span> parameter.
                        </span>
                      </span>
                    </label>

                    {addSourceUrl && (
                      <div className="mt-4 space-y-3 border-t border-[#E9D5FF]/60 pt-4">
                        <ValidatedTextInput
                          label="Source name"
                          required
                          value={sourceLabel}
                          onChange={(v) => setSourceLabel(v.slice(0, 60))}
                          placeholder="e.g. Instagram Story"
                          maxLength={60}
                          valid={sourceLabel.trim().length > 0}
                        />

                        <div>
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <label className="text-xs font-bold text-neutral-700">Source slug *</label>
                            <ModeToggle
                              mode={sourceSlugTouched ? "manual" : "auto"}
                              onAuto={() => {
                                setSourceSlugTouched(false);
                                setSourceSlug(sourceSlugify(sourceLabel || name || "direct"));
                              }}
                              onManual={() => setSourceSlugTouched(true)}
                            />
                          </div>
                          <div className="flex items-center overflow-hidden rounded-xl border border-[#E9D5FF] bg-white focus-within:border-[#A855F7] focus-within:ring-2 focus-within:ring-[#F3E8FF]">
                            <span className="shrink-0 border-r border-[#F3E8FF] bg-[#FAF5FF] px-3 py-2.5 text-[11px] font-bold text-[#7C3AED]">
                              ?src=
                            </span>
                            <input
                              type="text"
                              value={
                                sourceSlugTouched
                                  ? sourceSlug
                                  : sourceSlugify(sourceLabel || name || "direct")
                              }
                              onChange={(e) => {
                                setSourceSlugTouched(true);
                                setSourceSlug(sourceSlugify(e.target.value));
                              }}
                              readOnly={!sourceSlugTouched}
                              placeholder="instagram-story"
                              className={`w-full bg-transparent px-3 py-2.5 text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none ${
                                !sourceSlugTouched ? "text-neutral-500 cursor-default" : ""
                              }`}
                            />
                            {isValidSourceSlug(resolvedSourceSlug) && (
                              <CheckCircle2 className="mr-3 size-4 shrink-0 text-[#16A34A]" />
                            )}
                          </div>
                          {!isValidSourceSlug(resolvedSourceSlug) && (
                            <p className="mt-1.5 text-[10px] font-bold text-red-600">
                              Use letters, numbers, hyphens, or underscores.
                            </p>
                          )}
                        </div>

                        {trackedSourceUrl && (
                          <UrlPreviewRow label="Tracked link" url={trackedSourceUrl} variant="purple" />
                        )}
                      </div>
                    )}
                  </div>

                  <ImageUploadField
                    label="Campaign Banner"
                    required
                    imageUrl={bannerUrl}
                    ogImageUrl={ogImageUrl}
                    processing={bannerProcessing}
                    compressionNote={
                      bannerMeta
                        ? `Compressed ${formatBytes(bannerMeta.originalBytes)} → ${formatBytes(bannerMeta.bannerBytes)} · OG thumbnail ready`
                        : undefined
                    }
                    onUpload={handleBannerUpload}
                    onRemove={clearBanner}
                    aspect="banner"
                    hints={[
                      "Recommended: 1200 × 600px",
                      "JPG, PNG, or WEBP — auto-compressed on upload",
                      "OG link thumbnail (1200 × 630) generated automatically",
                    ]}
                  />

                  <ImageUploadField
                    label="Campaign Logo"
                    imageUrl={logoUrl}
                    processing={logoProcessing}
                    onUpload={handleLogoUpload}
                    onRemove={() => setLogoUrl("")}
                    aspect="logo"
                    hints={["Square format", "Auto-compressed to 512 × 512px"]}
                  />
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
                          <PreviewInfoRow emoji="📅" label="Duration" val={`${formatShortDate(startsAt)} – ${formatShortDate(endsAt)}`} />
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
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Pro Tip</p>
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
                    <SummaryRow icon={<Link2 className="size-4 text-[#2563EB]" />} label="Campaign URL" val={resolvedCampaignSlug} />
                    {trackedSourceUrl && (
                      <SummaryRow icon={<Radio className="size-4 text-[#7C3AED]" />} label="Source URL" val={resolvedSourceSlug} />
                    )}
                    <SummaryRow icon={<CalendarDays className="size-4 text-neutral-500" />} label="Duration" val={`${formatShortDate(startsAt)} – ${formatShortDate(endsAt)}`} />
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
                        <CheckItem checked={isValidCampaignSlug(resolvedCampaignSlug)} text="Campaign URL configured" />
                        <CheckItem checked={!!bannerUrl} text="Upload a high-quality banner" />
                        <CheckItem checked={prizes.length > 0} text="Add campaign rewards" />
                        <CheckItem checked={startsAt !== endsAt} text="Duration period configured" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP: Rewards (standard campaigns only) */}
            {currentStepKey === "rewards" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Column 1: Prize configuration */}
                <div className="lg:col-span-8 space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-50">
                          <Gift className="size-4.5 text-emerald-600" />
                        </div>
                        <h2 className="text-lg font-black text-neutral-900 tracking-tight">Rewards & Prizes</h2>
                        <span className="rounded-full bg-[#7C3AED]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#7C3AED]">
                          {prizes.length} Prize{prizes.length === 1 ? "" : "s"} Added
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-neutral-500 ml-12">
                        Define what rewards players can win.
                      </p>
                    </div>
                  </div>

                  {/* Quick-add type selector */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setQuickAddType("coupon")}
                      className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                        quickAddType === "coupon"
                          ? "border-[#7C3AED] bg-[#7C3AED]/5 shadow-sm"
                          : "border-neutral-200 bg-white hover:border-neutral-300"
                      }`}
                    >
                      <div
                        className={`flex size-10 items-center justify-center rounded-xl ${
                          quickAddType === "coupon" ? "bg-[#7C3AED]/15" : "bg-neutral-100"
                        }`}
                      >
                        <Ticket
                          className={`size-5 ${quickAddType === "coupon" ? "text-[#7C3AED]" : "text-neutral-500"}`}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900">Coupon / Discount</p>
                        <p className="text-[10px] text-neutral-500">Codes redeemed in-store or online</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickAddType("physical_gift")}
                      className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                        quickAddType === "physical_gift"
                          ? "border-[#16A34A] bg-[#16A34A]/5 shadow-sm"
                          : "border-neutral-200 bg-white hover:border-neutral-300"
                      }`}
                    >
                      <div
                        className={`flex size-10 items-center justify-center rounded-xl ${
                          quickAddType === "physical_gift" ? "bg-[#16A34A]/15" : "bg-neutral-100"
                        }`}
                      >
                        <Package
                          className={`size-5 ${quickAddType === "physical_gift" ? "text-[#16A34A]" : "text-neutral-500"}`}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900">Physical Gift</p>
                        <p className="text-[10px] text-neutral-500">Collected at counter or shipped</p>
                      </div>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {prizes.map((prize, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                            Prize Option {i + 1}
                          </span>
                          {prizes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removePrize(i)}
                              className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                              aria-label={`Remove prize ${i + 1}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
                          <div className="space-y-4 lg:col-span-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <Field label="Prize Type *">
                                <select
                                  value={prize.prize_type}
                                  onChange={(e) => {
                                    const nextType = e.target.value as PrizeType;
                                    updatePrize(i, "prize_type", nextType);
                                    if (!PRIZE_TYPES.find((t) => t.id === nextType)?.hasValue) {
                                      updatePrize(i, "prize_value", null as any);
                                    }
                                  }}
                                  className={inputCls}
                                >
                                  {PRIZE_TYPES.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="Prize Name *">
                                <div className="relative">
                                  <input
                                    type="text"
                                    value={prize.name}
                                    onChange={(e) => updatePrize(i, "name", e.target.value.slice(0, 60))}
                                    placeholder="e.g. 10% OFF Coupon"
                                    className={`${inputCls} pr-12`}
                                    maxLength={60}
                                  />
                                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400">
                                    {prize.name.length}/60
                                  </span>
                                </div>
                              </Field>
                            </div>

                            {PRIZE_TYPES.find((t) => t.id === prize.prize_type)?.hasValue && (
                              <Field label={prize.prize_type === "wallet_points" ? "Points" : "Value (₹)"}>
                                <input
                                  type="number"
                                  min={0}
                                  value={prize.prize_value ?? ""}
                                  onChange={(e) =>
                                    updatePrize(
                                      i,
                                      "prize_value",
                                      e.target.value === "" ? (null as any) : Number(e.target.value)
                                    )
                                  }
                                  placeholder={prize.prize_type === "wallet_points" ? "e.g. 100" : "e.g. 250"}
                                  className={inputCls}
                                />
                              </Field>
                            )}

                            <p className="text-[11px] text-neutral-400 -mt-1">
                              {PRIZE_TYPES.find((t) => t.id === prize.prize_type)?.hint}
                            </p>

                            {selectedType === "coupon_drop" && prize.prize_type === "coupon" && (
                              <div className="grid grid-cols-1 gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 sm:grid-cols-2">
                                <Field label="Discount Type *">
                                  <select
                                    value={prize.discount_type ?? "percentage"}
                                    onChange={(e) =>
                                      updatePrize(i, "discount_type", e.target.value as "percentage" | "fixed_amount")
                                    }
                                    className={inputCls}
                                  >
                                    <option value="percentage">Percentage (%)</option>
                                    <option value="fixed_amount">Fixed amount</option>
                                  </select>
                                </Field>
                                <Field
                                  label={prize.discount_type === "fixed_amount" ? "Amount Off *" : "Percent Off * (%)"}
                                >
                                  <input
                                    type="number"
                                    min={0}
                                    value={prize.discount_value ?? ""}
                                    onChange={(e) =>
                                      updatePrize(
                                        i,
                                        "discount_value",
                                        e.target.value === "" ? (null as any) : Number(e.target.value)
                                      )
                                    }
                                    placeholder={prize.discount_type === "fixed_amount" ? "e.g. 100" : "e.g. 10"}
                                    className={inputCls}
                                  />
                                </Field>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                              <Field label="Quantity">
                                <input
                                  type="number"
                                  min={1}
                                  value={prize.total_quantity}
                                  onChange={(e) => updatePrize(i, "total_quantity", Number(e.target.value))}
                                  className={inputCls}
                                />
                              </Field>
                              <Field label="Win Chance (Weight)">
                                <input
                                  type="number"
                                  min={0}
                                  value={prize.weight}
                                  onChange={(e) => updatePrize(i, "weight", Number(e.target.value))}
                                  className={inputCls}
                                />
                              </Field>
                              <Field label="Expiry Days">
                                <input
                                  type="number"
                                  min={1}
                                  value={prize.expiry_days}
                                  onChange={(e) => updatePrize(i, "expiry_days", Number(e.target.value))}
                                  className={inputCls}
                                />
                              </Field>
                            </div>

                            <label className="flex cursor-pointer select-none items-start gap-2.5 rounded-xl border border-neutral-100 bg-neutral-50/80 p-3">
                              <input
                                type="checkbox"
                                checked={prize.is_fallback}
                                onChange={(e) => setFallback(i, e.target.checked)}
                                className="mt-0.5 size-4 cursor-pointer rounded border-neutral-300 text-[#16A34A] focus:ring-[#16A34A]/20"
                              />
                              <span className="text-[11px] leading-snug">
                                <span className="font-bold text-neutral-700">Use as fallback prize</span>
                                <span className="mt-0.5 block text-neutral-400">
                                  Awarded when other prizes run out of stock. Only one per campaign.
                                </span>
                              </span>
                            </label>
                          </div>

                          <div className="lg:col-span-2">
                            <PrizePreviewCard prize={prize} couponPrefix={couponPrefix} />
                          </div>
                        </div>
                      </div>
                    ))}

                    {prizes.length < 8 && (
                      <button
                        type="button"
                        onClick={addPrize}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-200 py-4 text-sm font-bold text-neutral-600 transition-colors hover:border-[#7C3AED]/40 hover:bg-[#7C3AED]/5 hover:text-[#7C3AED]"
                      >
                        <Plus className="size-4" />
                        Add Another Prize
                      </button>
                    )}
                  </div>
                </div>

                {/* Column 2: Summary sidebar */}
                <div className="lg:col-span-4 space-y-6">
                  <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                      Campaign Summary
                    </p>
                    <SummaryRow icon={<Megaphone className="size-4 text-neutral-500" />} label="Campaign Name" val={name || "—"} />
                    <SummaryRow
                      icon={<FileText className="size-4 text-[#16A34A]" />}
                      label="Campaign Type"
                      badge={selectedCampaignOption.title}
                    />
                    <SummaryRow
                      icon={<CalendarDays className="size-4 text-neutral-500" />}
                      label="Duration"
                      val={`${formatShortDate(startsAt)} – ${formatShortDate(endsAt)}`}
                    />
                    <SummaryRow
                      icon={<Gift className="size-4 text-neutral-500" />}
                      label="Prize Options"
                      val={`${prizes.length} Prize${prizes.length === 1 ? "" : "s"}`}
                    />
                    <SummaryRow
                      icon={<Tag className="size-4 text-neutral-500" />}
                      label="Total Quantity"
                      val={`${prizes.reduce((sum, p) => sum + (p.total_quantity || 0), 0)} Prizes`}
                    />
                    <SummaryRow icon={<ShieldCheck className="size-4 text-neutral-500" />} label="Status" badge="Draft" />
                  </div>

                  <WinProbabilityChart prizes={prizes} />

                  <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                      Best Practices
                    </p>
                    <CheckItem
                      checked={prizes.some((p) => p.prize_type === "coupon") && prizes.some((p) => p.prize_type !== "coupon")}
                      text="Offer a mix of coupons and gifts"
                    />
                    <CheckItem
                      checked={prizes.every((p) => p.name.trim().length >= 2)}
                      text="Name every prize clearly for customers"
                    />
                    <CheckItem
                      checked={prizes.some((p) => p.is_fallback)}
                      text="Set a fallback prize for stock-outs"
                    />
                    <CheckItem
                      checked={prizes.reduce((s, p) => s + p.weight, 0) > 0}
                      text="Set win chances fair and exciting"
                    />
                    <CheckItem
                      checked={prizes.reduce((s, p) => s + p.total_quantity, 0) >= 50}
                      text="Set quantities realistic for store traffic"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP: Coupon Drop Settings */}
            {currentStepKey === "settings" && (
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 md:p-8 max-w-2xl mx-auto space-y-6">
                <StepHeader
                  icon={Tag}
                  title="Coupon Drop Settings"
                  sub="Configure discount codes, prefix, and campaign duration."
                />

                <Field label="Coupon Prefix *">
                  <input
                    type="text"
                    value={couponPrefix}
                    onChange={(e) =>
                      setCouponPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))
                    }
                    placeholder="e.g. DROP"
                    className={inputCls}
                    maxLength={10}
                  />
                </Field>
                <div className="bg-neutral-900 rounded-2xl p-6 text-center">
                  <p className="text-xs text-white/40 mb-2 font-bold uppercase tracking-wider">Sample Code Output</p>
                  <p className="text-3xl font-black text-white tracking-widest">{couponPrefix || "WIN"}-A8B9</p>
                </div>

                <div className="space-y-5 border-t border-neutral-200 pt-6">
                  <Field label="Win Mode">
                    <select
                      value={couponRules.win_mode}
                      onChange={(e) =>
                        setCouponRules({ ...couponRules, win_mode: e.target.value as CouponRules["win_mode"] })
                      }
                      className={inputCls}
                    >
                      <option value="weighted">Weighted draw (win / lose by odds)</option>
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
                        min={1}
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
                        placeholder="30"
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
                </div>

                <div className="space-y-5 border-t border-neutral-200 pt-6">
                  <StepHeader icon={CalendarDays} title="Campaign Duration" sub="When customers can claim coupons." />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Start Date *">
                      <input
                        type="date"
                        value={startsAt}
                        min={todayISO()}
                        onChange={(e) => setStartsAt(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="End Date *">
                      <input
                        type="date"
                        value={endsAt}
                        min={startsAt}
                        onChange={(e) => setEndsAt(e.target.value)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </div>

                <p className="text-xs text-neutral-500">
                  Codes are minted in Shopify when you publish. Requires the
                  <span className="font-semibold"> write_discounts</span> permission on your connected store.
                </p>
              </div>
            )}

            {/* STEP: Coupons (standard campaigns only) */}
            {currentStepKey === "coupons" && (
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
              </div>
            )}

            {/* STEP: Duration (standard campaigns only) */}
            {currentStepKey === "duration" && (
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

            {/* STEP: Preview */}
            {currentStepKey === "preview" && (
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
                  <ReviewRow label="Campaign URL" value={playUrl} />
                  {trackedSourceUrl && <ReviewRow label="Source URL" value={trackedSourceUrl} />}
                  {selectedType === "coupon_drop" && (
                    <>
                      <ReviewRow
                        label="Discount"
                        value={
                          couponRules.discount_type === "percentage"
                            ? `${couponRules.discount_value}% off`
                            : `${couponRules.currency} ${couponRules.discount_value} off`
                        }
                      />
                      <ReviewRow
                        label="Win Mode"
                        value={couponRules.win_mode === "always" ? "Everyone wins" : "Weighted draw"}
                      />
                    </>
                  )}
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
                {isLastStep ? (
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
                    disabled={
                      (currentStepKey === "basic" &&
                        (!name.trim() ||
                          !description.trim() ||
                          !bannerUrl ||
                          !isValidCampaignSlug(resolvedCampaignSlug) ||
                          (addSourceUrl &&
                            (!sourceLabel.trim() || !isValidSourceSlug(resolvedSourceSlug))))) ||
                      (currentStepKey === "settings" &&
                        (!couponPrefix.trim() || couponRules.discount_value <= 0 || startsAt >= endsAt))
                    }
                    className="inline-flex items-center gap-1 bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold px-6 py-2.5 rounded-full transition-colors shadow-lg shadow-green-500/20 cursor-pointer disabled:opacity-50"
                  >
                    {continueLabel}
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

const PRIZE_CHART_COLORS = ["#7C3AED", "#16A34A", "#2563EB", "#F59E0B", "#EC4899", "#06B6D4", "#8B5CF6", "#84CC16"];

function couponPreviewHeadline(prize: PrizeRow): string {
  if (prize.discount_value != null && prize.discount_type === "percentage") {
    return `${prize.discount_value}% OFF`;
  }
  if (prize.discount_value != null && prize.discount_type === "fixed_amount") {
    return `₹${prize.discount_value} OFF`;
  }
  const match = prize.name.match(/(\d+)\s*%/i);
  if (match) return `${match[1]}% OFF`;
  return prize.name.trim() || "10% OFF";
}

function WinProbabilityChart({ prizes }: { prizes: PrizeRow[] }) {
  const totalWeight = prizes.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  const segments = prizes.map((prize, i) => {
    const pct = totalWeight > 0 ? Math.round((Math.max(0, prize.weight) / totalWeight) * 100) : 0;
    return { prize, pct, color: PRIZE_CHART_COLORS[i % PRIZE_CHART_COLORS.length] };
  });

  let cursor = 0;
  const gradientStops = segments
    .map((seg) => {
      const start = cursor;
      cursor += seg.pct;
      return `${seg.color} ${start}% ${cursor}%`;
    })
    .join(", ");

  const gradient =
    totalWeight > 0 && segments.length > 0
      ? `conic-gradient(${gradientStops})`
      : "conic-gradient(#E5E7EB 0% 100%)";

  return (
    <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Win Probability Guide</p>

      <div className="flex items-center gap-5">
        <div className="relative size-28 shrink-0">
          <div className="size-full rounded-full" style={{ background: gradient }} />
          <div className="absolute inset-4 flex items-center justify-center rounded-full bg-white text-center shadow-inner">
            <div>
              <p className="text-lg font-black text-neutral-900">{totalWeight > 0 ? "100%" : "—"}</p>
              <p className="text-[9px] font-bold text-neutral-400">TOTAL</p>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {segments.length === 0 ? (
            <p className="text-xs text-neutral-400">Add prizes to see probability split.</p>
          ) : (
            segments.map((seg, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="mt-1 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-neutral-800">
                    {seg.prize.name.trim() || `Prize ${i + 1}`}{" "}
                    <span className="font-semibold text-neutral-400">({seg.pct}%)</span>
                  </p>
                  <p className="text-[10px] text-neutral-400">Weight: {seg.prize.weight}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PrizePreviewCard({ prize, couponPrefix }: { prize: PrizeRow; couponPrefix: string }) {
  const isCoupon = prize.prize_type === "coupon";
  const isPhysical = prize.prize_type === "physical_gift";

  return (
    <div className="flex h-full flex-col rounded-2xl border border-neutral-100 bg-neutral-50/80 p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
        {isCoupon ? "Coupon Preview" : isPhysical ? "Gift Preview" : "Prize Preview"}
      </p>

      {isCoupon ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#7C3AED]/30 bg-white p-4 text-center">
          <p className="text-2xl font-black tracking-tight text-[#7C3AED]">{couponPreviewHeadline(prize)}</p>
          <p className="mt-1 text-xs font-bold text-neutral-700">Discount Coupon</p>
          <p className="mt-3 rounded-lg bg-neutral-100 px-3 py-1.5 font-mono text-[10px] font-bold tracking-widest text-neutral-500">
            {couponPrefix || "WIN"}-XXXX
          </p>
          <p className="mt-2 text-[10px] text-neutral-400">Auto-generated code</p>
        </div>
      ) : isPhysical ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-[#16A34A]/10">
            <Package className="size-8 text-[#16A34A]" />
          </div>
          <p className="mt-3 text-sm font-bold text-neutral-800">{prize.name.trim() || "Physical Gift"}</p>
          <p className="mt-1 text-[10px] text-neutral-400">Collect at counter</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-[#2563EB]/10">
            <Gift className="size-8 text-[#2563EB]" />
          </div>
          <p className="mt-3 text-sm font-bold text-neutral-800">{prize.name.trim() || "Reward"}</p>
          <p className="mt-1 text-[10px] text-neutral-400">
            {PRIZE_TYPES.find((t) => t.id === prize.prize_type)?.label}
          </p>
        </div>
      )}
    </div>
  );
}

function UrlPreviewRow({
  label,
  url,
  variant = "neutral",
}: {
  label: string;
  url: string;
  variant?: "neutral" | "blue" | "purple";
}) {
  const [copied, setCopied] = useState(false);

  const styles = {
    neutral: "border-neutral-200 bg-white",
    blue: "border-[#BFDBFE] bg-white",
    purple: "border-[#E9D5FF] bg-white",
  }[variant];

  const iconColor = variant === "purple" ? "text-[#7C3AED]" : variant === "blue" ? "text-[#2563EB]" : "text-neutral-500";

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <div className="flex items-center gap-1.5">
        <Globe className={`size-3.5 ${iconColor}`} />
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{label}</p>
      </div>
      <div className="mt-1.5 flex items-start gap-2">
        <p className="flex-1 break-all font-mono text-[11px] font-semibold leading-relaxed text-neutral-700">{url}</p>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-[10px] font-bold text-neutral-600 transition-colors hover:bg-neutral-100"
        >
          {copied ? <Check className="size-3 text-[#16A34A]" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function ModeToggle({
  mode,
  onAuto,
  onManual,
}: {
  mode: "auto" | "manual";
  onAuto: () => void;
  onManual: () => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 text-[10px] font-bold">
      <button
        type="button"
        onClick={onAuto}
        className={`rounded-md px-2 py-1 transition-colors ${
          mode === "auto" ? "bg-[#16A34A] text-white shadow-sm" : "text-neutral-500 hover:text-neutral-700"
        }`}
      >
        Auto
      </button>
      <button
        type="button"
        onClick={onManual}
        className={`rounded-md px-2 py-1 transition-colors ${
          mode === "manual" ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-500 hover:text-neutral-700"
        }`}
      >
        Custom
      </button>
    </div>
  );
}

function ValidatedTextInput({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  valid,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  valid?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-neutral-700">
        {label}
        {required && " *"}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`${inputCls} ${maxLength ? "pr-16" : valid ? "pr-10" : ""}`}
        />
        {maxLength && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-neutral-400">
            {value.length}/{maxLength}
          </span>
        )}
        {valid && !maxLength && (
          <CheckCircle2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#16A34A]" />
        )}
        {valid && maxLength && (
          <CheckCircle2 className="absolute right-12 top-1/2 size-4 -translate-y-1/2 text-[#16A34A]" />
        )}
      </div>
    </div>
  );
}

function ValidatedTextarea({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  rows,
  valid,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
  valid?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-neutral-700">
        {label}
        {required && " *"}
      </label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows ?? 3}
          maxLength={maxLength}
          className={`${inputCls} resize-none pr-16`}
        />
        {maxLength && (
          <span className="absolute right-3 bottom-2.5 text-[10px] font-bold text-neutral-400">
            {value.length}/{maxLength}
          </span>
        )}
        {valid && (
          <CheckCircle2 className="absolute right-3 top-3 size-4 text-[#16A34A]" />
        )}
      </div>
    </div>
  );
}

function ImageUploadField({
  label,
  imageUrl,
  ogImageUrl,
  processing,
  compressionNote,
  onUpload,
  onRemove,
  aspect,
  hints,
  required,
}: {
  label: string;
  imageUrl: string;
  ogImageUrl?: string;
  processing?: boolean;
  compressionNote?: string;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  aspect: "banner" | "logo";
  hints: string[];
  required?: boolean;
}) {
  const isBanner = aspect === "banner";

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-neutral-700">
        {label}
        {required ? " *" : " (Optional)"}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {processing ? (
          <div
            className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-200 bg-neutral-50 ${
              isBanner ? "h-28 w-full sm:w-44" : "size-20"
            }`}
          >
            <Loader2 className="size-5 animate-spin text-neutral-400" />
            <span className="mt-1 text-[10px] font-bold text-neutral-500">Compressing…</span>
          </div>
        ) : imageUrl ? (
          <div className="flex flex-col gap-2">
            <div
              className={`relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 ${
                isBanner ? "h-28 w-full sm:w-44" : "size-20"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
            </div>
            {isBanner && ogImageUrl && (
              <div className="flex items-center gap-2">
                <div className="relative h-10 w-[76px] overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ogImageUrl} alt="OG thumbnail" className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-neutral-600">Link thumbnail</p>
                  <p className="text-[9px] text-neutral-400">1200 × 630 · WhatsApp, Facebook, X</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <label
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-200 transition-colors hover:border-neutral-300 ${
              isBanner ? "h-28 w-full sm:w-44" : "size-20"
            }`}
          >
            <Upload className={`text-neutral-400 ${isBanner ? "size-5 mb-1" : "size-4 mb-0.5"}`} />
            <span className="text-[10px] font-bold text-neutral-700">Upload</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} className="hidden" />
          </label>
        )}

        <div className="flex flex-1 flex-col gap-2">
          <div className="text-[10px] leading-relaxed text-neutral-400">
            {hints.map((hint) => (
              <p key={hint}>{hint}</p>
            ))}
          </div>
          {compressionNote && (
            <p className="text-[10px] font-semibold text-emerald-600">{compressionNote}</p>
          )}
          {imageUrl && !processing && (
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[10px] font-bold text-neutral-700 transition-colors hover:bg-neutral-50">
                <Upload className="size-3" />
                Change image
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} className="hidden" />
              </label>
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-bold text-red-600 transition-colors hover:bg-red-100"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
