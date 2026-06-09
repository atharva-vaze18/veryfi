import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Update = z.object({
  reviewDecision: z.enum(["cleared", "confirmed_fraud"]),
  reviewNotes: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const v = await prisma.verification.findUnique({ where: { id: params.id }, select: { id: true, orgId: true, band: true } });
  if (!v || v.orgId !== session.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = Update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await prisma.verification.update({
    where: { id: params.id },
    data: {
      reviewDecision: parsed.data.reviewDecision,
      reviewNotes: parsed.data.reviewNotes ?? null,
    },
  });

  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: `review.${parsed.data.reviewDecision}`,
    entityType: "Verification",
    entityId: params.id,
    payload: { decision: parsed.data.reviewDecision },
  });

  return NextResponse.json({ ok: true });
}
