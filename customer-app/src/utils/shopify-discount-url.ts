/** Shopify shareable discount link — applies the code when the customer lands. */
export function shopifyDiscountUrl(storeUrl: string, code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return storeUrl;

  try {
    const origin = new URL(storeUrl).origin;
    return `${origin}/discount/${encodeURIComponent(trimmed)}`;
  } catch {
    const base = storeUrl.replace(/\/$/, "");
    return `${base}/discount/${encodeURIComponent(trimmed)}`;
  }
}
