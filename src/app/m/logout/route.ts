import { NextResponse } from "next/server";
import { clearMerchantSession } from "@/lib/merchant-session";

async function handleLogout(request: Request) {
  await clearMerchantSession();
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(
    new URL("/m/login", origin),
    { status: 303 }
  );
}

/** POST /m/logout — called by the sidebar <form> submit */
export async function POST(request: Request) {
  return handleLogout(request);
}

/** GET /m/logout — fallback for direct navigation / bookmarks */
export async function GET(request: Request) {
  return handleLogout(request);
}
