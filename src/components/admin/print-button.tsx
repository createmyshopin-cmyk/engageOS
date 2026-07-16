"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mt-10 rounded-xl bg-neutral-900 px-8 py-3 font-semibold text-white active:bg-neutral-700 print:hidden"
    >
      Print this poster
    </button>
  );
}
