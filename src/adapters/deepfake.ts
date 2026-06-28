import { RealityDefender } from "@realitydefender/realitydefender";
import { env, features } from "@/lib/env";
import { traced } from "@/lib/observability";

// Deepfake-content scoring via Reality Defender (free ~50/mo tier). Analyzes the
// candidate's captured selfie frame for AI-generated / manipulated media. This is
// the specialist signal that catches a deepfaked face in the interview itself.
// When no provider is configured (or no frame was captured), it honestly reports
// "not evaluated" and does not move the score.
export interface DeepfakeModel {
  name: string;
  status: string;
  score: number;
}

export interface DeepfakeResult {
  evaluated: boolean;
  provider: string;
  syntheticProbability: number | null; // 0..1, higher = more likely AI-generated
  status?: string; // RD: "MANIPULATED" | "AUTHENTIC" | ...
  requestId?: string; // RD request id (look up in the RD dashboard)
  models?: DeepfakeModel[]; // per-model breakdown (the "why")
  note: string;
}

// Result helpers for the three non-final states.
const notConfigured = (): DeepfakeResult => ({ evaluated: false, provider: "none", syntheticProbability: null, note: "No deepfake-content provider configured (set REALITY_DEFENDER_API_KEY)." });
const noFrame = (): DeepfakeResult => ({ evaluated: false, provider: "Reality Defender", syntheticProbability: null, note: "No face image captured to analyze." });
export const pendingDeepfake = (): DeepfakeResult => ({ evaluated: false, provider: "Reality Defender", syntheticProbability: null, status: "processing", note: "Deepfake analysis in progress — result appears shortly." });

// STEP 1 (in submit): upload the captured frame and return immediately with a
// requestId. Upload is fast (seconds), so the candidate submit stays well within
// Vercel's free function budget. The heavy analysis happens server-side at RD;
// we poll for it later (getDeepfakeResult). Returns null when we can't start one.
export async function startDeepfake(filePath?: string | null): Promise<string | null> {
  if (!features.realityDefender || !filePath) return null;
  try {
    const rd = new RealityDefender({ apiKey: env.REALITY_DEFENDER_API_KEY });
    const { requestId } = await traced("deepfake", "rd_upload", () => rd.upload({ filePath }));
    return requestId ?? null;
  } catch {
    return null;
  }
}

// STEP 2 (on result-page poll): fetch the current RD result for a requestId.
// A null score means RD is still analyzing → we report it as still-processing so
// the caller keeps polling. A non-null score is the final verdict.
export async function getDeepfakeResult(requestId: string): Promise<DeepfakeResult> {
  if (!features.realityDefender) return notConfigured();
  try {
    const rd = new RealityDefender({ apiKey: env.REALITY_DEFENDER_API_KEY });
    const result = (await traced("deepfake", "rd_get_result", () =>
      Promise.race([
        rd.getResult(requestId),
        new Promise((_, reject) => setTimeout(() => reject(new Error("RD timeout")), env.DEEPFAKE_TIMEOUT_MS)),
      ]),
    )) as { status?: string; score?: number | null; models?: DeepfakeModel[] };
    const score = typeof result.score === "number" ? result.score : null;
    if (score == null) return pendingDeepfake(); // still analyzing
    return {
      evaluated: true,
      provider: "Reality Defender",
      syntheticProbability: score,
      status: result.status,
      requestId,
      models: Array.isArray(result.models) ? result.models : undefined,
      note: `RD analysis: ${result.status ?? "completed"} (${Math.round(score * 100)}% manipulated).`,
    };
  } catch {
    return pendingDeepfake(); // transient — keep polling
  }
}

// Used when no analysis could be started (no key / no frame) — honest "not evaluated".
export function deepfakeUnavailable(hasFrame: boolean): DeepfakeResult {
  return !features.realityDefender ? notConfigured() : hasFrame ? notConfigured() : noFrame();
}
