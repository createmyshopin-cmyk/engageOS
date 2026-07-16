import { NextResponse } from "next/server";
import { clearStaffSession } from "@/lib/staff-session";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse<{ ok: true }>> {
  await clearStaffSession();
  return NextResponse.json({ ok: true });
}
