"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { exportWinners } from "@/lib/api/hooks/use-winners";
import type { WinnerListFilters } from "@/lib/api/types";

export function WinnerExportButton({ filters }: { filters: WinnerListFilters }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setError(null);
    try {
      await exportWinners(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleExport}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-neutral-200/80 bg-white text-sm font-bold text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition disabled:opacity-60 shadow-sm"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Export
      </button>
      {error && <p className="text-[10px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}
