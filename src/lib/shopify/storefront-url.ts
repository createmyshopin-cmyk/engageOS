/**
 * Build a Shopify storefront URL that auto-applies a discount code.
 * @see https://shopify.dev/docs/apps/build/checkout/cart#shareable-discount-links
 */
export function shopifyDiscountUrl(
  storeUrl: string,
  code: string,
  redirectPath = "/",
): string {
  const trimmed = code.trim();
  if (!trimmed) return storeUrl;

  try {
    const origin = new URL(storeUrl).origin;
    const discountPath = `/discount/${encodeURIComponent(trimmed)}`;
    if (redirectPath && redirectPath !== "/") {
      return `${origin}${discountPath}?redirect=${encodeURIComponent(redirectPath)}`;
    }
    return `${origin}${discountPath}`;
  } catch {
    const base = storeUrl.replace(/\/$/, "");
    return `${base}/discount/${encodeURIComponent(trimmed)}`;
  }
}

/** Build a Shopify Admin URL for a discount code node GID. */
export function shopifyDiscountAdminUrl(shopDomain: string, parentGid: string): string {
  const numeric = parentGid.match(/(\d+)$/)?.[1];
  if (!numeric) return `https://${shopDomain}/admin/discounts`;
  return `https://${shopDomain}/admin/discounts/${numeric}`;
}
