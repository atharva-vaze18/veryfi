import { prisma } from "./db";
import { deepfakeSignal, summarizeSignals, type Signal } from "./score";
import { getDeepfakeResult } from "@/adapters/deepfake";
import type { Prisma } from "@prisma/client";

const DEEPFAKE_GIVE_UP_MS = 5 * 60 * 1000; // stop polling RD after 5 minutes

interface Pending { id: string; deepfakeRequestId: string | null; completedAt: Date | null; signalsJson: string | null }

// If a deepfake analysis is still pending, check Reality Defender once. When it
// resolves (or we give up after 5 min), swap the deepfake signal in, recompute the
// verdict from all signals, and persist. Returns the updated summary, or null if
// still analyzing. Pure-ish: safe to call from any poll (result page or dashboard).
export async function finalizeDeepfake(v: Pending): Promise<{ signals: Signal[]; riskScore: number; band: "pass" | "review" | "risk"; label: string } | null> {
  if (!v.deepfakeRequestId) return null;
  const df = await getDeepfakeResult(v.deepfakeRequestId);
  const agedOut = Date.now() - (v.completedAt?.getTime() ?? Date.now()) > DEEPFAKE_GIVE_UP_MS;
  if (df.status === "processing" && !agedOut) return null; // still analyzing — keep polling

  const signals: Signal[] = v.signalsJson ? JSON.parse(v.signalsJson) : [];
  const finalDf = df.status === "processing"
    ? { evaluated: false as const, provider: "Reality Defender", syntheticProbability: null, note: "Deepfake analysis did not finish in time." }
    : df;
  const idx = signals.findIndex((sg) => sg.key === "deepfake");
  const newSig = deepfakeSignal(finalDf);
  if (idx >= 0) signals[idx] = newSig; else signals.push(newSig);
  const summary = summarizeSignals(signals);

  const data: Prisma.VerificationUpdateInput = {
    riskScore: summary.riskScore,
    band: summary.band,
    verdict: summary.label,
    signalsJson: JSON.stringify(signals),
    deepfakeRequestId: null,
  };
  await prisma.verification.update({ where: { id: v.id }, data });
  return { signals, ...summary };
}
