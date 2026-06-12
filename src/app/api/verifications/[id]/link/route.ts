import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { newCandidateToken, defaultLinkExpiry } from "@/lib/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ action: z.enum(["revoke", "regenerate"]) });

// Revoke kills the current candidate link immediately. Regenerate revokes the old
// token (by replacing it) and issues a fresh one with a fresh expiry — the old URL
// stops working because the token no longer exists.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const v = await prisma.verification.findUnique({
    where: { id: params.id },
    select: { id: true, orgId: true, status: true },
  });
  if (!v || v.orgId !== session.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (v.status === "complete") {
    return NextResponse.json({ error: "Already completed — the link is no longer usable anyway." }, { status: 409 });
  }

  const data =
    parsed.data.action === "revoke"
      ? { revokedAt: new Date() }
      : { token: newCandidateToken(), expiresAt: defaultLinkExpiry(), revokedAt: null };

  const updated = await prisma.verification.update({ where: { id: v.id }, data });
  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: `verification.link_${parsed.data.action}d`,
    entityType: "Verification",
    entityId: v.id,
  });
  return NextResponse.json({
    ok: true,
    revoked: !!updated.revokedAt,
    expiresAt: updated.expiresAt,
    candidateLink: updated.revokedAt ? null : `${env.APP_URL}/v/${updated.token}`,
  });
}
