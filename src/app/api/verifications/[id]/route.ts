import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { type Signal } from "@/lib/score";
import { finalizeDeepfake } from "@/lib/deepfake-finalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Delete a verification (profile). Cascades to its consents.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const v = await prisma.verification.findUnique({ where: { id: params.id }, select: { id: true, orgId: true } });
  if (!v || v.orgId !== session.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.verification.delete({ where: { id: params.id } });
  await audit({ orgId: session.orgId, actor: session.userId, action: "verification.deleted", entityType: "Verification", entityId: params.id });
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const v = await prisma.verification.findUnique({
    where: { id: params.id },
    include: { consents: true },
  });
  if (!v || v.orgId !== session.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Async deepfake: finalize if RD has a result now (the result page polls this).
  const finalized = await finalizeDeepfake(v).catch(() => null);
  const signals: Signal[] = finalized ? finalized.signals : v.signalsJson ? JSON.parse(v.signalsJson) : [];
  const riskScore = finalized ? finalized.riskScore : v.riskScore;
  const band = finalized ? finalized.band : v.band;
  const verdict = finalized ? finalized.label : v.verdict;
  return NextResponse.json({
    id: v.id,
    candidateName: v.candidateName,
    candidateEmail: v.candidateEmail,
    roleContext: v.roleContext,
    declaredCountry: v.declaredCountry,
    status: v.status,
    candidateLink: `${env.APP_URL}/v/${v.token}`,
    riskScore,
    band,
    verdict,
    confidencePct: signals.length ? Math.round((signals.filter((s) => s.evaluated).length / signals.length) * 100) : null,
    idv: { status: v.idvStatus, provider: v.idvProvider, selfieMatch: v.selfieMatch, livenessPassed: v.livenessPassed },
    observedCountry: v.observedCountry,
    signals,
    consents: v.consents.map((c) => ({ type: c.type, version: c.documentVersion, signedAt: c.signedAt })),
    frameStorageKeys: v.frameStorageKeys ? (() => { try { return JSON.parse(v.frameStorageKeys!); } catch { return []; } })() : [],
    reviewDecision: v.reviewDecision,
    reviewNotes: v.reviewNotes,
    createdAt: v.createdAt,
    completedAt: v.completedAt,
  });
}
