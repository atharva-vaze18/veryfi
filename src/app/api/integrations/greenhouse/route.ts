import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fetchGreenhouseOrgInfo } from "@/lib/integrations/greenhouse";
import type { GreenhouseConfig } from "@/lib/integrations/greenhouse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Update = z.object({
  harvestApiKey: z.string().min(1),
  webhookSecret: z.string().min(1),
  triggerStageId: z.string().min(1),
  jobIds: z.array(z.string()).default([]),
  autoPostNote: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const integration = await prisma.integration.findUnique({
    where: { orgId: session.orgId },
  });

  if (!integration) return NextResponse.json({ configured: false });

  const config = (() => { try { return JSON.parse(integration.config) as GreenhouseConfig; } catch { return null; } })();
  if (!config) return NextResponse.json({ configured: false });

  // Mask the API key — show only the prefix.
  return NextResponse.json({
    configured: true,
    enabled: integration.enabled,
    harvestApiKeyPrefix: config.harvestApiKey.slice(0, 6) + "…",
    triggerStageId: config.triggerStageId,
    jobIds: config.jobIds,
    autoPostNote: config.autoPostNote,
  });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const parsed = Update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const config: GreenhouseConfig = {
    harvestApiKey: parsed.data.harvestApiKey,
    webhookSecret: parsed.data.webhookSecret,
    triggerStageId: parsed.data.triggerStageId,
    jobIds: parsed.data.jobIds,
    autoPostNote: parsed.data.autoPostNote,
  };

  await prisma.integration.upsert({
    where: { orgId: session.orgId },
    update: { config: JSON.stringify(config), enabled: parsed.data.enabled, provider: "greenhouse" },
    create: { orgId: session.orgId, provider: "greenhouse", config: JSON.stringify(config), enabled: parsed.data.enabled },
  });

  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "integration.updated",
    entityType: "Integration",
    entityId: session.orgId,
    payload: { provider: "greenhouse" },
  });

  return NextResponse.json({ ok: true });
}

// Test connection endpoint — verifies the Harvest API key is valid.
export async function PUT(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { harvestApiKey?: string };
  if (!body.harvestApiKey) return NextResponse.json({ error: "harvestApiKey required" }, { status: 400 });

  try {
    const info = await fetchGreenhouseOrgInfo(body.harvestApiKey);
    return NextResponse.json({ ok: true, name: info.name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
