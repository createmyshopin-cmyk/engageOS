import { z } from "zod";

/**
 * Zod validator for the Shopify Dev Dashboard connect endpoint. business_id is
 * NEVER accepted — it is derived from the authenticated principal. The merchant
 * supplies their own Dev Dashboard app's Client ID + Client Secret (multi-tenant
 * model); we validate shape here and validate the credentials against the live
 * Shopify API (client-credentials grant) in the adapter.
 */

const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/**
 * Body for POST /shopify/connect.
 *   - `shopDomain`   — the store's `*.myshopify.com` domain (accepts a pasted
 *     URL or bare handle; normalized + validated).
 *   - `clientId`     — the Dev Dashboard app's Client ID (public half).
 *   - `clientSecret` — the Dev Dashboard app's Client Secret (exchanged for a
 *     short-lived token; also verifies inbound webhook HMACs for THIS store).
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
  clientId: z
    .string()
    .trim()
    .min(10, "Enter the Client ID from your Dev Dashboard app"),
  clientSecret: z
    .string()
    .trim()
    .min(10, "Enter the Client Secret from your Dev Dashboard app"),
});
export type ConnectShopifyBody = z.infer<typeof connectShopifyBody>;
