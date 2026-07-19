import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import {
  connectGoogleSheets,
  disconnectGoogleSheets,
  getGoogleSheetsIntegration,
  normalizeWebappUrl,
  patchGoogleSheetsIntegration,
} from "@/lib/google-sheets/store";
import {
  listCampaignsForBusiness,
  listFeeds,
  listTagsForBusiness,
} from "@/lib/google-sheets/feeds-store";

export const runtime = "nodejs";

const GOOGLE_SHEETS_URL = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .refine((u) => {
    try {
      const parsed = new URL(u);
      return (
        parsed.hostname.includes("docs.google.com") &&
        parsed.pathname.includes("/spreadsheets/")
      );
    } catch {
      return false;
    }
  }, "Enter a valid Google Sheets URL (docs.google.com/spreadsheets/...)");

const WEBAPP_URL = z
  .string()
  .trim()
  .url("Enter a valid EngageOS web app URL")
  .transform(normalizeWebappUrl)
  .refine((u) => {
    try {
      const parsed = new URL(u);
      return parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    } catch {
      return false;
    }
  }, "Use https:// for production, or http://localhost for local dev");

const connectSchema = z.object({
  spreadsheetUrl: GOOGLE_SHEETS_URL,
  webappUrl: WEBAPP_URL,
  regenerate: z.boolean().optional(),
});

const patchSchema = z.object({
  spreadsheetUrl: GOOGLE_SHEETS_URL.nullable().optional(),
  webappUrl: WEBAPP_URL.nullable().optional(),
});

function publicIntegration(row: NonNullable<Awaited<ReturnType<typeof getGoogleSheetsIntegration>>>) {
  return {
    status: row.status,
    apiKeyPrefix: row.api_key_prefix,
    spreadsheetUrl: row.spreadsheet_url,
    webappUrl: row.webapp_url,
    lastSyncAt: row.last_sync_at,
    connectedAt: row.created_at,
  };
}

/** Current Google Sheets integration status for this tenant. */
export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  try {
    const integration = await getGoogleSheetsIntegration(repo.businessId);
    const connected = !!integration && integration.status === "connected";
    const [feeds, tags, campaigns] = connected
      ? await Promise.all([
          listFeeds(repo.businessId),
          listTagsForBusiness(repo.businessId),
          listCampaignsForBusiness(repo.businessId),
        ])
      : [[], [], []];

    return NextResponse.json({
      ok: true,
      connected,
      integration: integration && connected ? publicIntegration(integration) : null,
      feeds,
      tags,
      campaigns,
    });
  } catch (err) {
    console.error("google-sheets status error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load Google Sheets status" },
      { status: 500 }
    );
  }
}

/** Connect or regenerate the Google Sheets API key. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  let body: z.infer<typeof connectSchema>;
  try {
    body = connectSchema.parse(await req.json().catch(() => ({})));
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  try {
    const { integration, apiKey } = await connectGoogleSheets(
      repo.businessId,
      body.spreadsheetUrl,
      body.webappUrl
    );
    return NextResponse.json({
      ok: true,
      apiKey,
      integration: publicIntegration(integration),
      message: body.regenerate
        ? "API key regenerated. Update your Apps Script Script Properties."
        : "Google Sheets integration connected. Copy your API key now — it won't be shown again.",
    });
  } catch (err) {
    console.error("google-sheets connect error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to connect Google Sheets integration" },
      { status: 500 }
    );
  }
}

/** Update optional settings (spreadsheet URL, webapp URL). */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  try {
    const existing = await getGoogleSheetsIntegration(repo.businessId);
    if (!existing || existing.status !== "connected") {
      return NextResponse.json(
        { ok: false, error: "Google Sheets integration is not connected" },
        { status: 400 }
      );
    }
    await patchGoogleSheetsIntegration(repo.businessId, {
      ...(body.spreadsheetUrl !== undefined ? { spreadsheet_url: body.spreadsheetUrl } : {}),
      ...(body.webappUrl !== undefined ? { webapp_url: body.webappUrl } : {}),
    });
    const integration = await getGoogleSheetsIntegration(repo.businessId);
    return NextResponse.json({
      ok: true,
      integration: integration ? publicIntegration(integration) : null,
    });
  } catch (err) {
    console.error("google-sheets patch error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to update Google Sheets settings" },
      { status: 500 }
    );
  }
}

/** Disconnect the Google Sheets integration (invalidates API key). */
export async function DELETE(): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  try {
    await disconnectGoogleSheets(repo.businessId);
    return NextResponse.json({ ok: true, connected: false });
  } catch (err) {
    console.error("google-sheets disconnect error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to disconnect Google Sheets integration" },
      { status: 500 }
    );
  }
}
