import "server-only";
import { adminClient } from "@/lib/db/rpc";

const BUCKET = "campaign-images";

const MIME_EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Upload a data-URL image to the campaign-images bucket.
 * Returns the public URL, or the original value if it is already an http(s) URL.
 */
export async function uploadCampaignImageFromDataUrl(
  businessId: string,
  campaignId: string,
  value: string | null | undefined,
  kind: "banner" | "og" | "logo"
): Promise<string | null> {
  if (!value?.trim()) return null;
  if (!value.startsWith("data:image/")) return value;

  const match = value.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!match) {
    throw new Error(`Invalid image data for ${kind}`);
  }

  const [, mime, base64] = match;
  const ext = MIME_EXT[mime.toLowerCase()];
  if (!ext) {
    throw new Error(`Unsupported image type: ${mime}`);
  }

  const bytes = Buffer.from(base64, "base64");
  const path = `${businessId}/${campaignId}/${kind}.${ext}`;

  const supabase = adminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });

  if (error) {
    throw new Error(`Failed to upload ${kind} image: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
