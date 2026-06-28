import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleLeverWebhook } from "@/lib/integrations/lever";
import type { LeverConfig } from "@/lib/integrations/lever";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lever stage-change webhook. The payload carries no org identifier, so we
// iterate all enabled Lever integrations and let signature verification pick
// the right tenant. Same approach as the Greenhouse webhook receiver.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("lever-signature") ?? req.headers.get("x-lever-signature") ?? "";

  const integrations = await prisma.integration.findMany({
    where: { provider: "lever", enabled: true },
  });

  for (const integration of integrations) {
    const config = (() => { try { return JSON.parse(integration.config) as LeverConfig; } catch { return null; } })();
    if (!config) continue;
    try {
      const result = await handleLeverWebhook(rawBody, signature, integration.orgId, config);
      if (result.created) {
        return NextResponse.json({ ok: true, verificationId: result.verificationId });
      }
    } catch {
      // Wrong tenant for this signature — try the next.
    }
  }
  return NextResponse.json({ ok: true, created: false });
}
