import { env, features } from "@/lib/env";

// REAL ID + selfie + liveness. Two providers, selected by env:
//   • Didit (free)  — preferred when DIDIT_API_KEY + DIDIT_WORKFLOW_ID are set.
//   • Stripe Identity (~$1.50/check) — fallback when only Stripe is configured.
// When neither is configured the ID step is HONESTLY skipped — never auto-passed.
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
  // Preferred: Didit (free) — v3 sessions API.
  if (features.didit) {
    const res = await fetch("https://verification.didit.me/v3/session/", {
      method: "POST",
      headers: { "x-api-key": env.DIDIT_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow_id: env.DIDIT_WORKFLOW_ID,
        vendor_data: opts.verificationId,
        callback: opts.returnUrl,
        callback_method: "initiator",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Didit error ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as { session_id: string; url?: string };
    return { provider: "Didit", sessionRef: j.session_id, url: j.url ?? null, enabled: true };
  }

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
  if (!sessionRef) {
    return { status: "skipped", selfieMatch: null, livenessPassed: null, provider: "none" };
  }

  // Didit decision endpoint (v3).
  if (features.didit) {
    const res = await fetch(`https://verification.didit.me/v3/session/${sessionRef}/decision/`, {
      headers: { "x-api-key": env.DIDIT_API_KEY },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { status: "error", selfieMatch: null, livenessPassed: null, provider: "Didit" };
    const j = (await res.json()) as { status?: string };
    const approved = j.status === "Approved";
    return {
      status: approved
        ? "verified"
        : j.status === "Declined"
          ? "requires_input"
          : j.status === "In Review"
            ? "processing"
            : "skipped",
      selfieMatch: approved ? 0.99 : null,
      livenessPassed: approved ? true : j.status === "Declined" ? false : null,
      provider: "Didit",
    };
  }

  if (!features.stripeIdentity) {
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
