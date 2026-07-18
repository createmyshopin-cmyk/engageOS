import { describe, it, expect } from "vitest";
import { connectShopifyBody } from "@/server/modules/shopify/connection/validator";

/**
 * The connect validator is the tenant-facing boundary for the custom-app model.
 * It must normalize whatever domain shape a merchant pastes and reject anything
 * that isn't a real myshopify.com store, and it must require both secrets so we
 * never persist a half-configured connection.
 */
describe("connectShopifyBody", () => {
  const creds = { accessToken: "shpat_abcdefghij", apiSecret: "secret_abcdefghij" };

  it("accepts a bare store handle and appends the myshopify suffix", () => {
    const r = connectShopifyBody.parse({ ...creds, shopDomain: "acme" });
    expect(r.shopDomain).toBe("acme.myshopify.com");
  });

  it("strips a pasted URL down to the host", () => {
    const r = connectShopifyBody.parse({
      ...creds,
      shopDomain: "https://Acme-Store.myshopify.com/admin",
    });
    expect(r.shopDomain).toBe("acme-store.myshopify.com");
  });

  it("passes a already-normalized domain through unchanged", () => {
    const r = connectShopifyBody.parse({ ...creds, shopDomain: "my-shop.myshopify.com" });
    expect(r.shopDomain).toBe("my-shop.myshopify.com");
  });

  it("rejects a non-myshopify domain", () => {
    expect(() =>
      connectShopifyBody.parse({ ...creds, shopDomain: "evil.example.com" })
    ).toThrow();
  });

  it("rejects a missing access token", () => {
    expect(() =>
      connectShopifyBody.parse({ shopDomain: "acme", accessToken: "", apiSecret: creds.apiSecret })
    ).toThrow();
  });

  it("rejects a missing api secret", () => {
    expect(() =>
      connectShopifyBody.parse({ shopDomain: "acme", accessToken: creds.accessToken, apiSecret: "" })
    ).toThrow();
  });

  it("trims whitespace around the token and secret", () => {
    const r = connectShopifyBody.parse({
      shopDomain: "acme",
      accessToken: "  shpat_abcdefghij  ",
      apiSecret: "  secret_abcdefghij  ",
    });
    expect(r.accessToken).toBe("shpat_abcdefghij");
    expect(r.apiSecret).toBe("secret_abcdefghij");
  });
});
