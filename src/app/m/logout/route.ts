import { NextResponse } from "next/server";
import { clearMerchantSession } from "@/lib/merchant-session";

async function handleLogout() {
  await clearMerchantSession();
  return NextResponse.redirect(
    new URL("/m/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    { status: 303 }
  );
}

/** POST /m/logout — called by the sidebar <form> submit */
export async function POST() {
  return handleLogout();
}

/** GET /m/logout — fallback for direct navigation / bookmarks */
export async function GET() {
  return handleLogout();
}

