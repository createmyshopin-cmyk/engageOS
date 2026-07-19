import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { isAiGatewayEnabled } from "@/lib/ai-gateway/config";
import {
  runAssistantBroadcastConfirm,
  runMerchantAssistant,
} from "@/lib/ai-gateway/assistant/run";

export const runtime = "nodejs";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      })
    )
    .max(20)
    .optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAiGatewayEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "AI Assistant is not configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_AI_API_KEY.",
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  if (body && typeof body === "object" && "confirmBroadcast" in body) {
    const auth = await authorizeMerchantWrite();
    if (!auth.ok) return auth.response;

    try {
      const result = await runAssistantBroadcastConfirm(
        auth.repo,
        (body as { confirmBroadcast: unknown }).confirmBroadcast
      );
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      console.error("assistant broadcast confirm error:", err);
      const message = err instanceof Error ? err.message : "Failed to launch broadcast";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  }

  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;

  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const result = await runMerchantAssistant(auth.repo, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("assistant error:", err);
    const message = err instanceof Error ? err.message : "Assistant request failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
