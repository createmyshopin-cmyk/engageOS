"use client";

import { useState, useTransition, useEffect } from "react";
import QRCode from "qrcode";
import {
  Radio,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  QrCode,
  Download,
  X,
} from "lucide-react";
import type { MerchantSourceRow } from "@/lib/types";
import {
  createSourceAction,
  deleteSourceAction,
  recordSourceQrDownloadAction,
  type ActionState,
} from "@/app/m/sources/actions";

interface CampaignLite {
  slug: string;
  name: string;
  status: string;
}

interface Props {
  sources: MerchantSourceRow[];
  campaigns: CampaignLite[];
  businessSlug: string;
  baseUrl: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function SourcesManager({ sources, campaigns, businessSlug, baseUrl }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [qrFor, setQrFor] = useState<MerchantSourceRow | null>(null);

  function flash(type: "success" | "error", text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  }

  function submit() {
    const finalSlug = slugTouched ? slug : slugify(label);
    startTransition(async () => {
      const res: ActionState = await createSourceAction(
        { error: null },
        { label: label.trim(), slug: finalSlug }
      );
      if (res.error) {
        flash("error", res.error);
      } else {
        flash("success", "Source created");
        setShowForm(false);
        setLabel("");
        setSlug("");
        setSlugTouched(false);
      }
    });
  }

  function remove(source: MerchantSourceRow) {
    if (!confirm(`Delete source "${source.label}"? Existing analytics are kept.`)) return;
    startTransition(async () => {
      const res = await deleteSourceAction(source.id);
      if (res.error) flash("error", res.error);
      else flash("success", "Source deleted");
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-neutral-900 flex items-center gap-2">
            <Radio className="size-5 text-[#111827]" />
            Traffic Sources
          </h1>
          <p className="text-sm text-neutral-500 mt-1 max-w-xl">
            Name the places you share your campaign links — Front Gate, Billing Counter,
            Instagram — and track scans, plays and redemptions from each.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#111827] hover:bg-neutral-700 transition-colors cursor-pointer"
        >
          <Plus className="size-4" />
          New Source
        </button>
      </div>

      {msg && (
        <div
          className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${
            msg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {msg.type === "success" ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          {msg.text}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-neutral-500 mb-1.5">
                Source name
              </label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Front Gate"
                maxLength={60}
                className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-500 mb-1.5">
                Tracking tag (used in <span className="font-mono">?src=</span>)
              </label>
              <input
                value={slugTouched ? slug : slugify(label)}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="front-gate"
                maxLength={40}
                className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={isPending || label.trim().length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setLabel("");
                setSlug("");
                setSlugTouched(false);
              }}
              className="px-4 py-2 rounded-xl text-sm font-bold text-neutral-500 hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sources table */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        {sources.length === 0 ? (
          <div className="py-14 text-center">
            <Radio className="size-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-neutral-500">No sources yet</p>
            <p className="text-xs text-neutral-400 mt-1">
              Create a source to start tracking where your customers come from.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-100 text-[9px] uppercase tracking-wider text-neutral-400 font-black bg-neutral-50/60">
                  <th className="py-3 px-5">Source</th>
                  <th className="py-3 px-3 text-right">Scans</th>
                  <th className="py-3 px-3 text-right">Registrations</th>
                  <th className="py-3 px-3 text-right">Plays</th>
                  <th className="py-3 px-3 text-right">Wins</th>
                  <th className="py-3 px-3 text-right">Redeemed</th>
                  <th className="py-3 px-3 text-right">Conversion</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => {
                  const conv =
                    s.qr_scans > 0 ? Math.round((s.redemptions / s.qr_scans) * 100) : 0;
                  return (
                    <tr key={s.id} className="border-b border-neutral-50 last:border-0">
                      <td className="py-3 px-5">
                        <div className="font-bold text-sm text-neutral-900">{s.label}</div>
                        <div className="font-mono text-[10px] text-neutral-400">?src={s.slug}</div>
                      </td>
                      <td className="py-3 px-3 text-right text-xs font-bold text-neutral-900">{s.qr_scans}</td>
                      <td className="py-3 px-3 text-right text-xs font-bold text-neutral-900">{s.registrations}</td>
                      <td className="py-3 px-3 text-right text-xs font-bold text-neutral-900">{s.plays}</td>
                      <td className="py-3 px-3 text-right text-xs font-bold text-neutral-900">{s.wins}</td>
                      <td className="py-3 px-3 text-right text-xs font-black text-[#16A34A]">{s.redemptions}</td>
                      <td className="py-3 px-3 text-right text-xs font-black text-neutral-900">{conv}%</td>
                      <td className="py-3 px-5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setQrFor(s)}
                            title="Tracking links & QR"
                            className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
                          >
                            <QrCode className="size-4" />
                          </button>
                          <button
                            onClick={() => remove(s)}
                            disabled={isPending}
                            title="Delete source"
                            className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {qrFor && (
        <SourceLinksModal
          source={qrFor}
          campaigns={campaigns}
          businessSlug={businessSlug}
          baseUrl={baseUrl}
          onClose={() => setQrFor(null)}
        />
      )}
    </div>
  );
}

function SourceLinksModal({
  source,
  campaigns,
  businessSlug,
  baseUrl,
  onClose,
}: {
  source: MerchantSourceRow;
  campaigns: CampaignLite[];
  businessSlug: string;
  baseUrl: string;
  onClose: () => void;
}) {
  const activeCampaigns = campaigns.filter((c) => c.status === "active");
  const list = activeCampaigns.length > 0 ? activeCampaigns : campaigns;
  const [selected, setSelected] = useState(list[0]?.slug ?? "");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const trackedUrl = selected
    ? `${baseUrl}/c/${businessSlug}/${selected}?src=${source.slug}`
    : "";

  // Generate the QR for the current tracked URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!trackedUrl) {
        setQrDataUrl(null);
      } else {
        QRCode.toDataURL(trackedUrl, { width: 512, margin: 2 })
          .then((url) => setQrDataUrl(url))
          .catch(() => setQrDataUrl(null));
      }
    }, 0);
    return () => clearTimeout(t);
  }, [trackedUrl]);

  function copy() {
    navigator.clipboard.writeText(trackedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function download() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qr-${businessSlug}-${selected}-${source.slug}.png`;
    a.click();
    recordSourceQrDownloadAction(source.id, source.slug);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-black text-neutral-900">{source.label}</h3>
            <p className="font-mono text-[11px] text-neutral-400">?src={source.slug}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </div>

        {list.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6 text-center">
            Create a campaign first to generate tracked links.
          </p>
        ) : (
          <>
            <div>
              <label className="block text-xs font-bold text-neutral-500 mb-1.5">Campaign</label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              >
                {list.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                    {c.status !== "active" ? ` (${c.status})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {qrDataUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt={`QR for ${source.label}`}
                  className="size-48 rounded-xl border border-neutral-200"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-neutral-500 mb-1.5">Tracked link</label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={trackedUrl}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-neutral-200 text-xs font-mono bg-neutral-50 focus:outline-none"
                />
                <button
                  onClick={copy}
                  title="Copy link"
                  className="p-2.5 rounded-xl text-neutral-600 hover:bg-neutral-100 border border-neutral-200 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                </button>
              </div>
            </div>

            <button
              onClick={download}
              disabled={!qrDataUrl}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-[#111827] hover:bg-neutral-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Download className="size-4" />
              Download QR
            </button>
          </>
        )}
      </div>
    </div>
  );
}
