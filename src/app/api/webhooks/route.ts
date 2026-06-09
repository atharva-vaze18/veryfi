import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_EVENTS = ["verification.completed", "verification.flagged"] as const;

const Create = z.object({
  url: z.string().url(),
  events: z.array(z.enum(VALID_EVENTS)).min(1),
});

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, url: true, events: true, enabled: true, createdAt: true, lastDeliveredAt: true,
      deliveries: { orderBy: { createdAt: "desc" }, take: 1, select: { success: true } },
    },
  });

  return NextResponse.json({ endpoints });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const secret = randomBytes(32).toString("hex");
  const ep = await prisma.webhookEndpoint.create({
    data: {
      orgId: session.orgId,
      url: parsed.data.url,
      secret,
      events: JSON.stringify(parsed.data.events),
    },
  });

  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "webhook.created",
    entityType: "WebhookEndpoint",
    entityId: ep.id,
    payload: { url: parsed.data.url, events: parsed.data.events },
  });

  // Return the secret once so the org can verify incoming webhooks.
  return NextResponse.json({ id: ep.id, secret }, { status: 201 });
}
