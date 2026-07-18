import { z } from "zod";

/**
 * Zod validator for the Shopify custom-app connect endpoint. business_id is
 * NEVER accepted — it is derived from the authenticated principal. The merchant
 * supplies their own custom app's credentials (multi-tenant model); we validate
 * shape here and validate the token against the live Shopify API in the adapter.
 */

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Body for POST /shopify/connect.
 *   - `shopDomain`  — the store's `*.myshopify.com` domain (accepts a pasted
 *     URL or bare handle; normalized + validated).
 *   - `accessToken` — the custom app's Admin API access token (`shpat_…`).
 *   - `apiSecret`   — the custom app's API secret key (used to verify inbound
 *     webhook HMACs for THIS store).
 */
export const connectShopifyBody = z.object({
  shopDomain: z
    .string()
    .trim()
    .min(1, "Enter your Shopify store domain")
    .transform((v) => {
      let d = v.trim().toLowerCase();
      d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!d.includes(".")) d = `${d}.myshopify.com`;
      return d;
    })
    .refine((d) => SHOP_DOMAIN_RE.test(d), "Enter a valid myshopify.com domain"),
  accessToken: z
    .string()
    .trim()
    .min(10, "Enter the Admin API access token from your custom app"),
  apiSecret: z
    .string()
    .trim()
    .min(10, "Enter the API secret key from your custom app"),
});
export type ConnectShopifyBody = z.infer<typeof connectShopifyBody>;
