"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { clientIpFromHeaders } from "@/lib/ip";
import { z } from "zod";

/** Request context (ip + user agent) for event attribution. */
async function eventContext(): Promise<{ ip: string; userAgent: string | null }> {
  const h = await headers();
  return { ip: clientIpFromHeaders(h), userAgent: h.get("user-agent") };
}

export interface ActionState {
  error: string | null;
  success?: boolean;
}

const sourceSchema = z.object({
  label: z.string().trim().min(1, "Name your source").max(60),
  // The tracking slug used in ?src=. Normalized to lowercase kebab so the
  // ?src= value the merchant hands out matches what the analytics RPC keys on.
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Slug required")
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "Use letters, numbers, - or _ only"),
});

export async function createSourceAction(
  _prev: ActionState,
  payload: unknown
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  const validated = sourceSchema.safeParse(payload);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Validation failed" };
  }
  const { label, slug } = validated.data;

  try {
    const id = await repo.createSource(slug, label, null);
    revalidatePath("/m/sources");
    await repo.audit("source.create", "campaign_source", id, { slug, label });
    await repo.recordEvent(
      "source.created",
      null,
      { sourceId: id, slug, label },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return { error: "A source with that slug already exists" };
    }
    console.error("Create source exception:", err);
    return { error: "Failed to create source" };
  }
}

export async function deleteSourceAction(sourceId: string): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  try {
    await repo.deleteSource(sourceId);
    revalidatePath("/m/sources");
    await repo.audit("source.delete", "campaign_source", sourceId, {});
    await repo.recordEvent(
      "source.deleted",
      null,
      { sourceId },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Delete source exception:", err);
    return { error: "Failed to delete source" };
  }
}

/** Record that a merchant downloaded a source's tracking QR. Best-effort. */
export async function recordSourceQrDownloadAction(
  sourceId: string,
  slug: string
): Promise<void> {
  const repo = await getTenantRepository();
  if (!repo) return;
  await repo.recordEvent(
    "qr.downloaded",
    null,
    { sourceId, slug },
    await eventContext()
  );
}
