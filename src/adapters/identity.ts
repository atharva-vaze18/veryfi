import { env, features } from "@/lib/env";

// REAL ID + selfie + liveness via Stripe Identity (pay-as-you-go, ~$1.50/check).
// Called directly over Stripe's REST API (no SDK dependency). When no key is
// configured the ID step is HONESTLY skipped — never auto-passed.
export interface IdvSessionInfo {
  provider: string;
  sessionRef: string | null;
  url: string | null; // hosted verification URL the candidate is sent to
  enabled: boolean;
}

export interface IdvResult {
  status: "verified" | "requires_input" | "processing" | "error" | "skipped";
  selfieMatch: number | null;
  livenessPassed: boolean | null;
  provider: string;
}

function form(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export async function createIdvSession(opts: {
  verificationId: string;
  returnUrl: string;
}): Promise<IdvSessionInfo> {
  if (!features.stripeIdentity) {
    return { provider: "none", sessionRef: null, url: null, enabled: false };
  }
  const res = await fetch("https://api.stripe.com/v1/identity/verification_sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form({
      type: "document",
      "options[document][require_matching_selfie]": "true",
      "options[document][require_live_capture]": "true",
      "metadata[verificationId]": opts.verificationId,
      return_url: opts.returnUrl,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Stripe Identity error ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { id: string; url?: string; client_secret?: string };
  return { provider: "Stripe Identity", sessionRef: j.id, url: j.url ?? null, enabled: true };
}

export async function fetchIdvResult(sessionRef: string | null): Promise<IdvResult> {
  if (!features.stripeIdentity || !sessionRef) {
    return { status: "skipped", selfieMatch: null, livenessPassed: null, provider: "none" };
  }
  const res = await fetch(`https://api.stripe.com/v1/identity/verification_sessions/${sessionRef}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return { status: "error", selfieMatch: null, livenessPassed: null, provider: "Stripe Identity" };
  const j = (await res.json()) as { status: string };
  const verified = j.status === "verified";
  return {
    status: verified
      ? "verified"
      : j.status === "requires_input"
        ? "requires_input"
        : j.status === "processing"
          ? "processing"
          : "error",
    // Stripe returns no numeric score; a verified session means selfie+liveness passed.
    selfieMatch: verified ? 0.99 : null,
    livenessPassed: verified ? true : j.status === "requires_input" ? false : null,
    provider: "Stripe Identity",
  };
}
