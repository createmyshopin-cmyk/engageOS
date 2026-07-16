"use server";

import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { adminClient } from "@/lib/db/rpc";
import { clientIpFromHeaders } from "@/lib/ip";
import { hashPin } from "@/lib/staff-session";
import { hash as argon2Hash } from "@node-rs/argon2";
import {
  createAdminSession,
  isAdmin,
  verifyAdminPassword,
} from "@/lib/admin-session";
import {
  onboardMerchantSchema,
  slugify,
  TIER_WEIGHTS,
} from "@/lib/validation";
import type { Business, Campaign } from "@/lib/types";

export interface ActionState {
  error: string | null;
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return { error: "Enter the password" };
  }
  try {
    // Brute-force guard: 10 attempts per IP per hour.
    const ip = clientIpFromHeaders(await headers());
    const { data: allowed, error: rlError } = await adminClient().rpc(
      "check_rate_limit",
      { p_key: `adminlogin:${ip}`, p_max: 10 }
    );
    if (rlError) throw new Error(`rate limit failed: ${rlError.message}`);
    if (!allowed) {
      return { error: "Too many attempts. Try again in an hour." };
    }
    if (!verifyAdminPassword(password)) {
      return { error: "Wrong password" };
    }
    await createAdminSession();
  } catch (err) {
    console.error("admin login error:", err);
    return { error: "Server configuration problem" };
  }
  redirect("/admin");
}

export async function logoutAdminAction() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_session");
  redirect("/admin");
}

/** Find a free slug by suffixing -2, -3... when taken. */
async function freeSlug(
  table: "businesses" | "campaigns",
  base: string
): Promise<string> {
  const supabase = adminClient();
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (error) throw new Error(`slug check failed: ${error.message}`);
    if (!data) return candidate;
  }
  throw new Error(`No free slug for "${base}"`);
}

export async function onboardMerchantAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!(await isAdmin())) redirect("/admin");

  // Collect dynamic prize rows: prize_name_0.., prize_qty_0.., prize_tier_0..
  const prizes: Array<{ name: unknown; quantity: unknown; tier: unknown }> = [];
  for (let i = 0; i < 8; i++) {
    const name = formData.get(`prize_name_${i}`);
    if (typeof name !== "string" || name.trim() === "") continue;
    prizes.push({
      name,
      quantity: formData.get(`prize_qty_${i}`),
      tier: formData.get(`prize_tier_${i}`),
    });
  }

  const parsed = onboardMerchantSchema.safeParse({
    businessName: formData.get("businessName"),
    city: formData.get("city"),
    ownerPhone: formData.get("ownerPhone"),
    pin: formData.get("pin"),
    campaignName: formData.get("campaignName"),
    headline: formData.get("headline") || undefined,
    endsAt: formData.get("endsAt"),
    prizes,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  }
  const input = parsed.data;

  const supabase = adminClient();
  let businessSlug: string;
  try {
    businessSlug = await freeSlug("businesses", slugify(input.businessName));

    const { data: business, error: bizError } = await supabase
      .from("businesses")
      .insert({
        name: input.businessName,
        slug: businessSlug,
        phone: input.ownerPhone,
        city: input.city || null,
        staff_pin: await hashPin(input.pin),
      })
      .select("id, slug, public_id")
      .single<Pick<Business, "id" | "slug" | "public_id">>();
    if (bizError) throw new Error(`business insert failed: ${bizError.message}`);

    const campaignSlug = await freeSlug(
      "campaigns",
      `${businessSlug}-${slugify(input.campaignName)}`.slice(0, 60)
    );
    const { data: campaign, error: campError } = await supabase
      .from("campaigns")
      .insert({
        business_id: business.id,
        name: input.campaignName,
        slug: campaignSlug,
        headline: input.headline,
        status: "active",
        ends_at: endOfDayIst(input.endsAt).toISOString(),
      })
      .select("id")
      .single<Pick<Campaign, "id">>();
    if (campError) throw new Error(`campaign insert failed: ${campError.message}`);

    const { error: prizeError } = await supabase.from("prizes").insert(
      input.prizes.map((p) => ({
        campaign_id: campaign.id,
        name: p.name,
        weight: TIER_WEIGHTS[p.tier],
        total_quantity: p.quantity,
      }))
    );
    if (prizeError) throw new Error(`prizes insert failed: ${prizeError.message}`);
  } catch (err) {
    console.error("onboarding error:", err);
    return { error: "Could not create the merchant. Check the details and try again." };
  }

  redirect(`/admin/merchant/${businessSlug}`);
}

/** Campaign end date means "end of that day" in India. */
function endOfDayIst(d: Date): Date {
  // Interpret the picked calendar date as 23:59:59 IST (UTC+5:30).
  const iso = d.toISOString().slice(0, 10);
  return new Date(`${iso}T23:59:59+05:30`);
}

export async function regenerateMerchantLinkAction(
  businessId: string
): Promise<void> {
  if (!(await isAdmin())) redirect("/admin");
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("businesses")
    .update({ merchant_token: crypto.randomUUID() })
    .eq("id", businessId)
    .select("slug")
    .single<Pick<Business, "slug">>();
  if (error) {
    console.error("regenerate link error:", error);
    throw new Error("Could not regenerate the link");
  }
  redirect(`/admin/merchant/${data.slug}`);
}

/**
 * Admin: create a merchant portal account for a business.
 * Only callable by authenticated operators.
 */
export async function createMerchantAccountAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (!(await isAdmin())) redirect("/admin");

  const businessId = formData.get("business_id") as string | null;
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const email = (formData.get("email") as string | null)?.toLowerCase().trim() ?? "";
  const password = formData.get("password") as string | null;
  const role = (formData.get("role") as string | null) ?? "owner";

  if (!businessId) return { error: "Business ID is required" };
  if (!name || name.length < 2) return { error: "Name must be at least 2 characters" };
  if (!email || !email.includes("@")) return { error: "Valid email is required" };
  if (!password || password.length < 8) return { error: "Password must be at least 8 characters" };
  if (!["owner", "manager", "staff"].includes(role)) return { error: "Invalid role" };

  let passwordHash: string;
  try {
    passwordHash = await argon2Hash(password, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  } catch (err) {
    console.error("argon2 hash error:", err);
    return { error: "Server error hashing password" };
  }

  const supabase = adminClient();
  const { error } = await supabase.from("merchants").insert({
    business_id: businessId,
    name,
    email,
    password_hash: passwordHash,
    role,
    status: "active",
  });

  if (error) {
    if (error.code === "23505") {
      return { error: `Email "${email}" is already registered` };
    }
    console.error("create merchant account error:", error);
    return { error: "Failed to create merchant account" };
  }

  return { error: null };
}
