import { NextResponse } from "next/server";
import { features } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Also used by the candidate page as a latency ping target.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "orbyt-verify",
    t: Date.now(),
    detectors: {
      ipIntel: features.proxycheck
        ? "proxycheck.io (LIVE)"
        : features.ipqs
          ? "IPQualityScore (LIVE)"
          : "ipapi.co geo-only (VPN not evaluated)",
      idv: features.stripeIdentity ? "Stripe Identity (LIVE)" : "skipped (not configured)",
      deepfake: features.realityDefender ? "Reality Defender (configured)" : "not evaluated",
    },
  });
}
