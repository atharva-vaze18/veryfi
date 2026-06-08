import { features } from "@/lib/env";

// Deepfake-content scoring slot (enterprise vendor, e.g. Reality Defender, which
// has a free ~50/mo tier). This is the one detection that needs a specialist
// model. The product is valuable WITHOUT it — relay/VPN/virtual-camera/liveness
// catch most real fake-candidate fraud. Wire the vendor here when ready; until
// then the signal is honestly reported as "not evaluated" and does not move the
// score.
export interface DeepfakeResult {
  evaluated: boolean;
  provider: string;
  // 0..1 probability the media is synthetic, when evaluated.
  syntheticProbability: number | null;
  note: string;
}

export async function scoreDeepfake(_mediaUrl?: string): Promise<DeepfakeResult> {
  if (!features.realityDefender) {
    return {
      evaluated: false,
      provider: "none",
      syntheticProbability: null,
      note: "No deepfake-content provider configured (set REALITY_DEFENDER_API_KEY).",
    };
  }
  // TODO: wire Reality Defender (upload media → poll result). Left unimplemented
  // intentionally rather than faked — returns not-evaluated until integrated.
  return {
    evaluated: false,
    provider: "Reality Defender",
    syntheticProbability: null,
    note: "Provider configured; integration pending — not yet scoring.",
  };
}
