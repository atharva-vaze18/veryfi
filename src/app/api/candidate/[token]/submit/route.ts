import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getClientIp } from "@/lib/request";
import { getIpIntel } from "@/adapters/ipintel";
import { getEmailRisk } from "@/adapters/emailrisk";
import { fetchIdvResult } from "@/adapters/identity";
import { startDeepfake, pendingDeepfake, deepfakeUnavailable } from "@/adapters/deepfake";
import { computeVerdict, detectVirtualCameras, SCORE_VERSION, type ClientSignals, type BehavioralSignals } from "@/lib/score";
import { features } from "@/lib/env";
import { linkState, linkDeadMessage } from "@/lib/token";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { deliverWebhook } from "@/lib/webhook";
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
  const rl = rateLimit(`cand:submit:${params.token}:${getClientIp(req)}`, 10, 5 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const v = await prisma.verification.findUnique({ where: { token: params.token }, include: { consents: true } });
  if (!v) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (v.status === "complete") return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  const state = linkState(v);
  if (state !== "active") return NextResponse.json({ error: linkDeadMessage(state) }, { status: 410 });

  const signed = new Set(v.consents.map((c) => c.type));
  if (!signed.has("DATA_PROCESSING") || !signed.has("BIOMETRIC")) {
    return NextResponse.json({ error: "All consents must be signed first" }, { status: 409 });
  }

  // Idempotency: atomically claim the verification. Two concurrent submits (double
  // click, refresh-retry, scripted replay) race here and exactly one wins; the
  // loser sees the same 409 as a late duplicate. On any failure below, the claim
  // is released so the candidate can legitimately retry without a new link.
  const claim = await prisma.verification.updateMany({
    where: { id: v.id, status: { notIn: ["complete", "processing"] } },
    data: { status: "processing" },
  });
  if (claim.count === 0) return NextResponse.json({ error: "Already submitted" }, { status: 409 });

  try {

  const body = (await req.json().catch(() => ({}))) as { clientSignals?: ClientSignals & { behavioral?: BehavioralSignals }; faceImage?: string; sessionFrames?: string[] };
  const client: ClientSignals = body.clientSignals ?? {};
  client.virtualCameraLabels = detectVirtualCameras(client.cameraLabels ?? []);
  const behavioralSignals: BehavioralSignals | null = body.clientSignals?.behavioral ?? null;

  // Persist the captured selfie frame to a temp file for deepfake analysis (then delete).
  const framePath = await writeFrameToTemp(body.faceImage, params.token);

  const ip = getClientIp(req);
  // Kick off deepfake analysis async (upload → requestId, fast) so the submit
  // returns within the serverless budget; the result-page poll finalizes it.
  const [ipIntel, email, idv, deepfakeRequestId] = await Promise.all([
    getIpIntel(ip),
    getEmailRisk(v.candidateEmail),
    fetchIdvResult(v.idvSessionRef),
    startDeepfake(framePath),
  ]);
  if (framePath) await unlink(framePath).catch(() => {});

  const deepfake = deepfakeRequestId ? pendingDeepfake() : deepfakeUnavailable(!!framePath);
  const scoringProfile = await prisma.scoringProfile.findUnique({ where: { orgId: v.orgId } });
  const verdict = computeVerdict({
    declaredCountry: v.declaredCountry,
    declaredName: v.candidateName,
    idvAvailable: features.didit || features.stripeIdentity,
    ip: ipIntel,
    email,
    idv,
    deepfake,
    client,
    behavioral: behavioralSignals,
  }, scoringProfile ?? undefined);

  // Feature 6: store session frames in Supabase Storage if band === "review"
  let frameStorageKeys: string[] | null = null;
  if (verdict.band === "review" && Array.isArray(body.sessionFrames) && body.sessionFrames.length > 0) {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && supabaseServiceKey) {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const keys: string[] = [];
        for (const frame of body.sessionFrames.slice(0, 10)) {
          const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/i.exec(frame);
          if (!m) continue;
          const buf = Buffer.from(m[2]!, "base64");
          const ts = Date.now();
          const key = `${v.id}/${ts}-${keys.length}.jpg`;
          const { error } = await supabase.storage.from("session-frames").upload(key, buf, { contentType: "image/jpeg" });
          if (!error) keys.push(key);
        }
        if (keys.length > 0) frameStorageKeys = keys;
      }
    } catch { /* storage upload failure should not block the submission */ }
  }

  await prisma.verification.update({
    where: { id: v.id },
    data: {
      status: "complete",
      riskScore: verdict.riskScore,
      scoreVersion: SCORE_VERSION,
      band: verdict.band,
      verdict: verdict.label,
      signalsJson: JSON.stringify(verdict.signals),
      idvStatus: idv.status,
      idvProvider: idv.provider,
      idName: idv.idName,
      selfieMatch: idv.selfieMatch,
      livenessPassed: idv.livenessPassed,
      observedCountry: ipIntel.country,
      deepfakeRequestId,
      completedAt: new Date(),
      behavioralJson: behavioralSignals ? JSON.stringify(behavioralSignals) : null,
      frameStorageKeys: frameStorageKeys ? JSON.stringify(frameStorageKeys) : null,
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

  // Deliver webhooks asynchronously — don't block the candidate's response.
  const webhookEvent = verdict.band === "risk" ? "verification.flagged" : "verification.completed";
  deliverWebhook(v.id, "verification.completed", {
    event: "verification.completed",
    verificationId: v.id,
    candidateName: v.candidateName,
    candidateEmail: v.candidateEmail,
    band: verdict.band,
    riskScore: verdict.riskScore,
    completedAt: new Date().toISOString(),
    signals: verdict.signals,
  }).catch(() => {});
  if (webhookEvent === "verification.flagged") {
    deliverWebhook(v.id, "verification.flagged", {
      event: "verification.flagged",
      verificationId: v.id,
      candidateName: v.candidateName,
      candidateEmail: v.candidateEmail,
      band: verdict.band,
      riskScore: verdict.riskScore,
      completedAt: new Date().toISOString(),
      signals: verdict.signals,
    }).catch(() => {});
  }

  // Receipt only. The verdict, score and signal weights are confidential to the
  // hiring team — returning them here would hand a fraudster an oracle to iterate
  // against until they pass.
  return NextResponse.json({ ok: true, status: "complete" });
  } catch (e) {
    // Release the idempotency claim so a genuine technical failure is retryable
    // with the same link (and without double billing — usage counts creations).
    await prisma.verification
      .updateMany({ where: { id: v.id, status: "processing" }, data: { status: "consented" } })
      .catch(() => {});
    return NextResponse.json({ error: "Verification could not be completed — please try again." }, { status: 500 });
  }
}
