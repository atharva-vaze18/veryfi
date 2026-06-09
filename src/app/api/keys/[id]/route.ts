import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const key = await prisma.apiKey.findUnique({ where: { id: params.id } });
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (key.orgId !== session.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.apiKey.update({ where: { id: params.id }, data: { enabled: false } });
  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "apikey.revoked",
    entityType: "ApiKey",
    entityId: params.id,
  });

  return NextResponse.json({ ok: true });
}
