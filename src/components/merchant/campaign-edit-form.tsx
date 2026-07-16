"use client";

import { useActionState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { updateCampaignAction } from "@/app/m/campaigns/actions";
import type { Campaign } from "@/lib/types";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Save,
  Image as ImageIcon,
  Tag,
  CalendarDays,
  FileText,
  Megaphone,
} from "lucide-react";

type EditableCampaign = Pick<
  Campaign,
  | "id"
  | "name"
  | "headline"
  | "description"
  | "banner_url"
  | "logo_url"
  | "terms"
  | "coupon_prefix"
  | "starts_at"
  | "ends_at"
  | "status"
>;

interface Props {
  campaign: EditableCampaign;
}

function toDatetimeLocal(isoString: string | null | undefined): string {
  if (!isoString) return "";
  // Trim to "YYYY-MM-DDTHH:mm" for <input type="datetime-local">
  return isoString.slice(0, 16);
}

export function CampaignEditForm({ campaign }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [state, formAction] = useActionState(
    async (_prev: { error: string | null; success?: boolean }, formData: FormData) => {
      const payload = {
        name: formData.get("name"),
        headline: formData.get("headline"),
        description: formData.get("description"),
        banner_url: formData.get("banner_url"),
        logo_url: formData.get("logo_url"),
        terms: formData.get("terms"),
        coupon_prefix: formData.get("coupon_prefix"),
        starts_at: formData.get("starts_at"),
        ends_at: formData.get("ends_at"),
      };
      const result = await updateCampaignAction(campaign.id, _prev, payload);
      if (result.success) {
        router.push(`/m/campaigns/${campaign.id}`);
      }
      return result;
    },
    { error: null }
  );

  const isActive = campaign.status === "active";

  return (
    <form action={formAction} className="space-y-6">
      {/* Global error / success */}
      {state.error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm">
          <CheckCircle2 className="size-4 shrink-0" />
          Campaign updated successfully!
        </div>
      )}

      {isActive && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>
            This campaign is <strong>live</strong>. Changes take effect immediately for new visitors.
          </span>
        </div>
      )}

      {/* Section: Basic Info */}
      <SectionCard icon={<Megaphone className="size-4" />} title="Campaign Info">
        <Field label="Campaign Name" required>
          <input
            name="name"
            type="text"
            defaultValue={campaign.name}
            required
            minLength={2}
            maxLength={80}
            placeholder="e.g. Onam Mega Scratch & Win"
            className="input"
          />
        </Field>
        <Field label="Headline" required hint="Short tagline shown on the play page">
          <input
            name="headline"
            type="text"
            defaultValue={campaign.headline}
            required
            minLength={2}
            maxLength={60}
            placeholder="e.g. Scratch & win amazing prizes!"
            className="input"
          />
        </Field>
        <Field label="Description" hint="Optional longer description">
          <textarea
            name="description"
            defaultValue={campaign.description ?? ""}
            maxLength={500}
            rows={3}
            placeholder="Describe the campaign..."
            className="input resize-none"
          />
        </Field>
      </SectionCard>

      {/* Section: Media */}
      <SectionCard icon={<ImageIcon className="size-4" />} title="Media">
        <Field label="Banner Image URL" hint="Wide header image shown at top of play page">
          <input
            name="banner_url"
            type="url"
            defaultValue={campaign.banner_url ?? ""}
            placeholder="https://..."
            className="input"
          />
        </Field>
        <Field label="Logo URL" hint="Square logo overlaid on the banner">
          <input
            name="logo_url"
            type="url"
            defaultValue={campaign.logo_url ?? ""}
            placeholder="https://..."
            className="input"
          />
        </Field>
      </SectionCard>

      {/* Section: Dates */}
      <SectionCard icon={<CalendarDays className="size-4" />} title="Campaign Dates">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Start Date & Time" required>
            <input
              name="starts_at"
              type="datetime-local"
              defaultValue={toDatetimeLocal(campaign.starts_at)}
              required
              className="input"
            />
          </Field>
          <Field label="End Date & Time" required>
            <input
              name="ends_at"
              type="datetime-local"
              defaultValue={toDatetimeLocal(campaign.ends_at)}
              required
              className="input"
            />
          </Field>
        </div>
      </SectionCard>

      {/* Section: Settings */}
      <SectionCard icon={<Tag className="size-4" />} title="Coupon Settings">
        <Field
          label="Coupon Prefix"
          required
          hint="Uppercase letters & numbers only. Prefix for generated coupon codes."
        >
          <input
            name="coupon_prefix"
            type="text"
            defaultValue={campaign.coupon_prefix}
            required
            minLength={2}
            maxLength={10}
            placeholder="ONAM25"
            pattern="[A-Z0-9]+"
            className="input uppercase"
          />
        </Field>
      </SectionCard>

      {/* Section: Terms */}
      <SectionCard icon={<FileText className="size-4" />} title="Terms & Conditions">
        <Field label="Terms" hint="Displayed at the bottom of the play page">
          <textarea
            name="terms"
            defaultValue={campaign.terms ?? ""}
            maxLength={1000}
            rows={4}
            placeholder="e.g. Valid until 15 Aug 2026. One prize per customer..."
            className="input resize-none"
          />
        </Field>
      </SectionCard>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <a
          href={`/m/campaigns/${campaign.id}`}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-colors"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-[#16A34A] hover:bg-[#166534] transition-colors disabled:opacity-60 cursor-pointer"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save Changes
        </button>
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 0.625rem 0.875rem;
          background: #F8FAFC;
          border: 1px solid #E5E7EB;
          border-radius: 0.75rem;
          font-size: 0.875rem;
          color: #111827;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input:focus {
          border-color: #16A34A;
          box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.12);
        }
        .input::placeholder {
          color: #9CA3AF;
        }
      `}</style>
    </form>
  );
}

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200/70 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-neutral-100">
        <span className="text-neutral-500">{icon}</span>
        <h2 className="text-sm font-black text-neutral-900">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-neutral-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-neutral-400">{hint}</p>}
    </div>
  );
}
