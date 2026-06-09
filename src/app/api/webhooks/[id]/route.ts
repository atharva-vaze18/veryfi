import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const ep = await prisma.webhookEndpoint.findUnique({ where: { id: params.id } });
  if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ep.orgId !== session.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.webhookEndpoint.delete({ where: { id: params.id } });
  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "webhook.deleted",
    entityType: "WebhookEndpoint",
    entityId: params.id,
  });

  return NextResponse.json({ ok: true });
}
