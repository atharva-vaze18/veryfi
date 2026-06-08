import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/request";
import { getIpIntel } from "@/adapters/ipintel";
import { getEmailRisk } from "@/adapters/emailrisk";
import { fetchIdvResult } from "@/adapters/identity";
import { scoreDeepfake } from "@/adapters/deepfake";
import { computeVerdict, detectVirtualCameras, type ClientSignals } from "@/lib/score";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const v = await prisma.verification.findUnique({ where: { token: params.token }, include: { consents: true } });
  if (!v) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (v.status === "complete") return NextResponse.json({ error: "Already submitted" }, { status: 409 });

  const signed = new Set(v.consents.map((c) => c.type));
  if (!signed.has("DATA_PROCESSING") || !signed.has("BIOMETRIC")) {
    return NextResponse.json({ error: "All consents must be signed first" }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as { clientSignals?: ClientSignals };
  const client: ClientSignals = body.clientSignals ?? {};
  // Compute virtual-camera matches server-side from the reported device labels.
  client.virtualCameraLabels = detectVirtualCameras(client.cameraLabels ?? []);

  const ip = getClientIp(req);
  const [ipIntel, email, idv, deepfake] = await Promise.all([
    getIpIntel(ip),
    getEmailRisk(v.candidateEmail),
    fetchIdvResult(v.idvSessionRef),
    scoreDeepfake(),
  ]);

  const verdict = computeVerdict({
    declaredCountry: v.declaredCountry,
    ip: ipIntel,
    email,
    idv,
    deepfake,
    client,
  });

  await prisma.verification.update({
    where: { id: v.id },
    data: {
      status: "complete",
      riskScore: verdict.riskScore,
      band: verdict.band,
      verdict: verdict.label,
      signalsJson: JSON.stringify(verdict.signals),
      idvStatus: idv.status,
      idvProvider: idv.provider,
      selfieMatch: idv.selfieMatch,
      livenessPassed: idv.livenessPassed,
      observedCountry: ipIntel.country,
      completedAt: new Date(),
    },
  });

  await audit({
    orgId: v.orgId,
    actor: `candidate:${params.token.slice(0, 8)}`,
    action: "verification.completed",
    entityType: "Verification",
    entityId: v.id,
    payload: { band: verdict.band, riskScore: verdict.riskScore },
  });

  return NextResponse.json({
    band: verdict.band,
    riskScore: verdict.riskScore,
    label: verdict.label,
    confidencePct: verdict.confidencePct,
  });
}
