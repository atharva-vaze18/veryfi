import { RealityDefender } from "@realitydefender/realitydefender";
import { env, features } from "@/lib/env";

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

// `filePath` is a local image written from the candidate's captured frame.
export async function scoreDeepfake(filePath?: string | null): Promise<DeepfakeResult> {
  if (!features.realityDefender) {
    return { evaluated: false, provider: "none", syntheticProbability: null, note: "No deepfake-content provider configured (set REALITY_DEFENDER_API_KEY)." };
  }
  if (!filePath) {
    return { evaluated: false, provider: "Reality Defender", syntheticProbability: null, note: "No face image captured to analyze." };
  }
  try {
    const rd = new RealityDefender({ apiKey: env.REALITY_DEFENDER_API_KEY });
    // RD detect() uploads + polls; cap the wait so the submit handler always
    // returns within the serverless function budget (see DEEPFAKE_TIMEOUT_MS —
    // tuned low for Vercel's free tier; on timeout we degrade to "not evaluated").
    const result = (await Promise.race([
      rd.detect({ filePath }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("RD timeout")), env.DEEPFAKE_TIMEOUT_MS)),
    ])) as { status?: string; score?: number; requestId?: string; models?: DeepfakeModel[] };

    const score = typeof result.score === "number" ? result.score : null;
    return {
      evaluated: score != null,
      provider: "Reality Defender",
      syntheticProbability: score,
      status: result.status,
      requestId: result.requestId,
      models: Array.isArray(result.models) ? result.models : undefined,
      note: `RD analysis: ${result.status ?? "completed"}${score != null ? ` (${Math.round(score * 100)}% manipulated)` : ""}.`,
    };
  } catch (e) {
    // Graceful + honest: a timeout/error means "not evaluated", never a fake pass.
    return { evaluated: false, provider: "Reality Defender", syntheticProbability: null, note: `Deepfake analysis unavailable: ${(e as Error).message}.` };
  }
}
