"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeChip({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!code) return <span className="text-neutral-300 text-xs">—</span>;

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-[11px] font-bold font-mono hover:bg-violet-100 transition border border-violet-100"
      title="Copy code"
    >
      {code}
      {copied ? <Check className="size-3" /> : <Copy className="size-3 opacity-60" />}
    </button>
  );
}
