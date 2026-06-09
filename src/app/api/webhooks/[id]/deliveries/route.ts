import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const ep = await prisma.webhookEndpoint.findUnique({ where: { id: params.id } });
  if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ep.orgId !== session.orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { endpointId: params.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, event: true, responseStatus: true, responseBodySnippet: true,
      attemptCount: true, lastAttemptAt: true, success: true, createdAt: true,
      verificationId: true,
    },
  });

  return NextResponse.json({ deliveries });
}
