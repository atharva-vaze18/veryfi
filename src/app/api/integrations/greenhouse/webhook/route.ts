import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleGreenhouseWebhook } from "@/lib/integrations/greenhouse";
import type { GreenhouseConfig } from "@/lib/integrations/greenhouse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("signature") ?? req.headers.get("x-greenhouse-signature") ?? "";

  // Greenhouse webhooks don't carry an org identifier — look up all active Greenhouse
  // integrations and attempt signature verification against each.
  const integrations = await prisma.integration.findMany({
    where: { provider: "greenhouse", enabled: true },
  });

  for (const integration of integrations) {
    const config = (() => { try { return JSON.parse(integration.config) as GreenhouseConfig; } catch { return null; } })();
    if (!config) continue;

    try {
      const result = await handleGreenhouseWebhook(rawBody, signature, integration.orgId, config);
      if (result.created) {
        return NextResponse.json({ ok: true, verificationId: result.verificationId });
      }
    } catch {
      // Wrong org (signature mismatch) — try the next one.
    }
  }

  return NextResponse.json({ ok: true, created: false });
}
