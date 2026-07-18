"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload, X, ImageIcon, Gift } from "lucide-react";
import type { Prize, PrizeType } from "@/lib/types";
import {
  addRewardAction,
  updateRewardAction,
  type ActionState,
} from "@/app/m/campaigns/[id]/rewards/actions";

const PRIZE_TYPES: { id: PrizeType; label: string; hint: string; hasValue: boolean }[] = [
  { id: "coupon", label: "Coupon", hint: "Discount code redeemed in-store", hasValue: false },
  { id: "physical_gift", label: "Physical Gift", hint: "Collected at the counter", hasValue: false },
  { id: "gift_voucher", label: "Gift Voucher", hint: "Fixed-value voucher code", hasValue: true },
  { id: "lucky_draw", label: "Lucky Draw Entry", hint: "Entry into an end-of-campaign draw", hasValue: false },
  { id: "cashback", label: "Cashback", hint: "Amount credited back", hasValue: true },
  { id: "wallet_points", label: "Wallet Points", hint: "Loyalty points added", hasValue: true },
];

const inputCls =
  "w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition";

interface FormShape {
  name: string;
  description: string;
  prize_type: PrizeType;
  prize_value: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: string;
  weight: string;
  total_quantity: string;
  expiry_days: string;
  is_fallback: boolean;
  image_url: string;
  background_color: string;
  badge: string;
  sort_order: string;
  priority: string;
}

function initial(prize?: Prize): FormShape {
  return {
    name: prize?.name ?? "",
    description: prize?.description ?? "",
    prize_type: prize?.prize_type ?? "coupon",
    prize_value: prize?.prize_value != null ? String(prize.prize_value) : "",
    discount_type: prize?.discount_type ?? "percentage",
    discount_value: prize?.discount_value != null ? String(prize.discount_value) : "",
    weight: prize?.weight != null ? String(prize.weight) : "100",
    total_quantity: prize?.total_quantity != null ? String(prize.total_quantity) : "100",
    expiry_days: prize?.expiry_days != null ? String(prize.expiry_days) : "15",
    is_fallback: prize?.is_fallback ?? false,
    image_url: prize?.image_url ?? "",
    background_color: prize?.background_color ?? "#059669",
    badge: prize?.badge ?? "",
    sort_order: prize?.sort_order != null ? String(prize.sort_order) : "0",
    priority: prize?.priority != null ? String(prize.priority) : "0",
  };
}

interface Props {
  campaignId: string;
  prize?: Prize; // present ⇒ edit mode
  onClose: () => void;
  onSaved: () => void;
}

export function RewardForm({ campaignId, prize, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormShape>(() => initial(prize));
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const typeMeta = PRIZE_TYPES.find((t) => t.id === form.prize_type)!;

  function set<K extends keyof FormShape>(key: K, value: FormShape[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("campaignId", campaignId);
      fd.append("file", file);
      const res = await fetch("/api/m/rewards/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!json.ok || !json.url) {
        setError(json.error ?? "Upload failed");
        return;
      }
      set("image_url", json.url);
    } catch {
      setError("Upload failed. Check your connection.");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    setError(null);
    const payload = {
      name: form.name,
      description: form.description,
      prize_type: form.prize_type,
      prize_value: typeMeta.hasValue && form.prize_value !== "" ? Number(form.prize_value) : null,
      discount_type: form.prize_type === "coupon" ? form.discount_type : null,
      discount_value:
        form.prize_type === "coupon" && form.discount_value !== "" ? Number(form.discount_value) : null,
      weight: form.weight,
      total_quantity: form.total_quantity,
      expiry_days: form.expiry_days,
      is_fallback: form.is_fallback,
      image_url: form.image_url,
      background_color: form.background_color,
      badge: form.badge,
      sort_order: form.sort_order,
      priority: form.priority,
    };
    startTransition(async () => {
      const res: ActionState = prize
        ? await updateRewardAction(campaignId, prize.id, { error: null }, payload)
        : await addRewardAction(campaignId, { error: null }, payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  const busy = isPending || uploading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 sticky top-0 bg-white">
          <h3 className="font-black text-neutral-900">{prize ? "Edit Reward" : "Add Reward"}</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 cursor-pointer">
            <X className="size-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Preview */}
          <div className="rounded-2xl overflow-hidden border border-neutral-200">
            <div
              className="flex flex-col items-center justify-center p-6 text-center text-white"
              style={{ backgroundColor: form.background_color || "#059669" }}
            >
              {form.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.image_url} alt={form.name} className="h-16 w-16 rounded-xl bg-white/20 object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/20">
                  <Gift className="size-7" />
                </div>
              )}
              <p className="mt-2 text-lg font-black">{form.name || "Reward name"}</p>
              {form.description && <p className="mt-0.5 text-xs text-white/80">{form.description}</p>}
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-sm text-red-700">{error}</p>
          )}

          <Field label="Reward Name">
            <input type="text" value={form.name} maxLength={60} onChange={(e) => set("name", e.target.value)} className={inputCls} placeholder="10% OFF Coupon" />
          </Field>

          <Field label="Description (optional)">
            <textarea rows={2} value={form.description} maxLength={280} onChange={(e) => set("description", e.target.value)} className={inputCls + " resize-none"} placeholder="Shown to the customer on the win screen" />
          </Field>

          {/* Image upload */}
          <Field label="Reward Image (optional)">
            <div className="flex items-center gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl transition-colors disabled:opacity-60 cursor-pointer"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {form.image_url ? "Replace" : "Upload"}
              </button>
              {form.image_url && (
                <button type="button" onClick={() => set("image_url", "")} className="text-xs font-bold text-red-600 hover:text-red-700 cursor-pointer">
                  Remove
                </button>
              )}
              {!form.image_url && !uploading && (
                <span className="inline-flex items-center gap-1 text-xs text-neutral-400"><ImageIcon className="size-3.5" /> PNG/JPEG/WebP, ≤2MB</span>
              )}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Background Colour">
              <div className="flex items-center gap-2">
                <input type="color" value={form.background_color} onChange={(e) => set("background_color", e.target.value)} className="h-10 w-12 rounded-lg border border-neutral-300 cursor-pointer" />
                <input type="text" value={form.background_color} onChange={(e) => set("background_color", e.target.value)} className={inputCls} placeholder="#059669" />
              </div>
            </Field>
            <Field label="Reward Type">
              <select value={form.prize_type} onChange={(e) => set("prize_type", e.target.value as PrizeType)} className={inputCls}>
                {PRIZE_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <p className="-mt-2 text-xs text-neutral-400">{typeMeta.hint}</p>

          {typeMeta.hasValue && (
            <Field label={form.prize_type === "wallet_points" ? "Points" : "Value (₹)"}>
              <input type="number" min={0} value={form.prize_value} onChange={(e) => set("prize_value", e.target.value)} className={inputCls} placeholder="0" />
            </Field>
          )}

          {form.prize_type === "coupon" && (
            <div className="grid grid-cols-2 gap-4 rounded-xl bg-emerald-50/60 border border-emerald-100 p-3">
              <Field label="Discount Type">
                <select
                  value={form.discount_type}
                  onChange={(e) => set("discount_type", e.target.value as FormShape["discount_type"])}
                  className={inputCls}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed_amount">Fixed amount</option>
                </select>
              </Field>
              <Field label={form.discount_type === "fixed_amount" ? "Amount Off" : "Percent Off (%)"}>
                <input
                  type="number"
                  min={0}
                  value={form.discount_value}
                  onChange={(e) => set("discount_value", e.target.value)}
                  className={inputCls}
                  placeholder={form.discount_type === "fixed_amount" ? "e.g. 100" : "e.g. 10"}
                />
              </Field>
              <p className="col-span-2 text-[11px] leading-snug text-emerald-700/80">
                For Coupon Drop campaigns, this tier mints its own Shopify discount at this rate.
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <Field label="Weight">
              <input type="number" min={0} value={form.weight} onChange={(e) => set("weight", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Quantity">
              <input type="number" min={1} value={form.total_quantity} onChange={(e) => set("total_quantity", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Expiry (days)">
              <input type="number" min={1} value={form.expiry_days} onChange={(e) => set("expiry_days", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Badge (optional)">
              <input type="text" value={form.badge} maxLength={24} onChange={(e) => set("badge", e.target.value)} className={inputCls} placeholder="Popular" />
            </Field>
            <Field label="Sort Order">
              <input type="number" min={0} value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Priority">
              <input type="number" min={0} value={form.priority} onChange={(e) => set("priority", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-neutral-700 cursor-pointer">
            <input type="checkbox" checked={form.is_fallback} onChange={(e) => set("is_fallback", e.target.checked)} className="size-4 rounded" />
            Fallback reward (awarded when other prizes run out)
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-100 sticky bottom-0 bg-white">
          <button onClick={onClose} disabled={busy} className="text-sm font-bold px-4 py-2.5 text-neutral-600 hover:text-neutral-900 disabled:opacity-60 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 text-sm font-bold px-5 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl transition-colors disabled:opacity-60 cursor-pointer"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {prize ? "Save Changes" : "Add Reward"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-neutral-700">{label}</label>
      {children}
    </div>
  );
}
