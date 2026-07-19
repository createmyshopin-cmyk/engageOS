import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { adminClient } from "@/lib/db/rpc";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type ApiResponse =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response as NextResponse<ApiResponse>;
  const { repo } = auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid upload" }, { status: 400 });
  }

  const campaignId = form.get("campaignId");
  const file = form.get("file");

  if (typeof campaignId !== "string" || !campaignId) {
    return NextResponse.json({ ok: false, error: "Missing campaign" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
  }

  if (!(await repo.ownsCampaign(campaignId))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  const ext = ALLOWED[file.type];
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Only PNG, JPEG or WebP images are allowed" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "Image must be 2MB or smaller" }, { status: 400 });
  }

  const path = `${repo.businessId}/${campaignId}/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const supabase = adminClient();
  const { error } = await supabase.storage
    .from("reward-images")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (error) {
    console.error("reward image upload failed:", error.message);
    return NextResponse.json({ ok: false, error: "Upload failed. Try again." }, { status: 500 });
  }

  const { data } = supabase.storage.from("reward-images").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
