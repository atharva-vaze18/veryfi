import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { fetchLeverOrgInfo } from "@/lib/integrations/lever";
import type { LeverConfig } from "@/lib/integrations/lever";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Update = z.object({
  apiKey: z.string().min(1),
  webhookSecret: z.string().min(1),
  triggerStageId: z.string().min(1),
  autoPostNote: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const integration = await prisma.integration.findUnique({
    where: { orgId_provider: { orgId: session.orgId, provider: "lever" } },
  });

  if (!integration) return NextResponse.json({ configured: false });

  const config = (() => { try { return JSON.parse(integration.config) as LeverConfig; } catch { return null; } })();
  if (!config) return NextResponse.json({ configured: false });

  // Mask the API key — show only the prefix so the recruiter can confirm
  // which key is saved without ever re-exposing the secret.
  return NextResponse.json({
    configured: true,
    enabled: integration.enabled,
    apiKeyPrefix: config.apiKey.slice(0, 6) + "…",
    triggerStageId: config.triggerStageId,
    autoPostNote: config.autoPostNote,
  });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const parsed = Update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const config: LeverConfig = {
    apiKey: parsed.data.apiKey,
    webhookSecret: parsed.data.webhookSecret,
    triggerStageId: parsed.data.triggerStageId,
    autoPostNote: parsed.data.autoPostNote,
  };

  await prisma.integration.upsert({
    where: { orgId_provider: { orgId: session.orgId, provider: "lever" } },
    update: { config: JSON.stringify(config), enabled: parsed.data.enabled },
    create: { orgId: session.orgId, provider: "lever", config: JSON.stringify(config), enabled: parsed.data.enabled },
  });

  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "integration.updated",
    entityType: "Integration",
    entityId: session.orgId,
    payload: { provider: "lever" },
  });

  return NextResponse.json({ ok: true });
}

// Test connection — verifies the Lever API key is valid.
export async function PUT(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { apiKey?: string };
  if (!body.apiKey) return NextResponse.json({ error: "apiKey required" }, { status: 400 });

  try {
    const info = await fetchLeverOrgInfo(body.apiKey);
    return NextResponse.json({ ok: true, name: info.name });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
