import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/request";
import { getIpIntel } from "@/adapters/ipintel";
import { getEmailRisk } from "@/adapters/emailrisk";
import { fetchIdvResult } from "@/adapters/identity";
import { scoreDeepfake } from "@/adapters/deepfake";
import { computeVerdict, detectVirtualCameras, type ClientSignals } from "@/lib/score";
import { audit } from "@/lib/audit";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const runtime = "nodejs";
// 10s keeps this within Vercel's FREE (Hobby) function budget. The deepfake step
// is capped by DEEPFAKE_TIMEOUT_MS (default 8s) so it degrades to "not evaluated"
// instead of killing the request; every other signal still scores normally.
// On Vercel Pro: raise this to 60 and set DEEPFAKE_TIMEOUT_MS=45000 to let
// Reality Defender finish (it takes ~15-40s). See docs/DEPLOY.md.
export const maxDuration = 10;

// Writes a base64 data-URL image to a temp file for deepfake analysis. The frame
// is transient — analyzed then deleted; never stored.
async function writeFrameToTemp(dataUrl: string | undefined, token: string): Promise<string | null> {
  if (!dataUrl) return null;
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[2]!, "base64");
  if (buf.length < 1000 || buf.length > 8_000_000) return null; // sanity bounds
  const path = join(tmpdir(), `orbyt-rd-${token.slice(0, 12)}.${m[1] === "png" ? "png" : "jpg"}`);
  await writeFile(path, buf);
  return path;
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const v = await prisma.verification.findUnique({ where: { token: params.token }, include: { consents: true } });
  if (!v) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (v.status === "complete") return NextResponse.json({ error: "Already submitted" }, { status: 409 });

  const signed = new Set(v.consents.map((c) => c.type));
  if (!signed.has("DATA_PROCESSING") || !signed.has("BIOMETRIC")) {
    return NextResponse.json({ error: "All consents must be signed first" }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as { clientSignals?: ClientSignals; faceImage?: string };
  const client: ClientSignals = body.clientSignals ?? {};
  // Compute virtual-camera matches server-side from the reported device labels.
  client.virtualCameraLabels = detectVirtualCameras(client.cameraLabels ?? []);

  // Persist the captured selfie frame to a temp file for deepfake analysis (then delete).
  const framePath = await writeFrameToTemp(body.faceImage, params.token);

  const ip = getClientIp(req);
  const [ipIntel, email, idv, deepfake] = await Promise.all([
    getIpIntel(ip),
    getEmailRisk(v.candidateEmail),
    fetchIdvResult(v.idvSessionRef),
    scoreDeepfake(framePath),
  ]);
  if (framePath) await unlink(framePath).catch(() => {});

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
