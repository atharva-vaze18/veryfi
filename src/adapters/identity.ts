import { env, features } from "@/lib/env";
import { traced } from "@/lib/observability";

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
  idName: string | null; // full name read off the government ID (for name-match)
}

// Recursively hunt a decision payload for the name printed on the ID. Providers
// nest this differently (e.g. id_verification.full_name, or first/last name), so
// we search defensively rather than assume one shape.
function extractIdName(obj: unknown, depth = 0): string | null {
  if (!obj || typeof obj !== "object" || depth > 5) return null;
  const o = obj as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const full = str(o.full_name) ?? str(o.fullName) ?? str(o.name_on_document) ?? str(o.document_name);
  if (full) return full;
  const first = str(o.first_name) ?? str(o.firstName) ?? str(o.given_name);
  const last = str(o.last_name) ?? str(o.lastName) ?? str(o.surname) ?? str(o.family_name);
  if (first || last) return [first, last].filter(Boolean).join(" ");
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") {
      const found = extractIdName(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// Find a 0..1 face/selfie-match score anywhere in the payload (providers report
// it as 0..1 or 0..100 — normalize to 0..1).
function extractFaceScore(obj: unknown, depth = 0): number | null {
  if (!obj || typeof obj !== "object" || depth > 5) return null;
  const o = obj as Record<string, unknown>;
  for (const key of ["face_match", "faceMatch", "face_comparison"]) {
    const fm = o[key];
    if (fm && typeof fm === "object") {
      const sc = (fm as Record<string, unknown>).score;
      if (typeof sc === "number") return sc > 1 ? sc / 100 : sc;
    }
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") {
      const found = extractFaceScore(v, depth + 1);
      if (found != null) return found;
    }
  }
  return null;
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
    const res = await traced("identity", "didit_create_session", () =>
      fetch("https://verification.didit.me/v3/session/", {
        method: "POST",
        headers: { "x-api-key": env.DIDIT_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow_id: env.DIDIT_WORKFLOW_ID,
          vendor_data: opts.verificationId,
          callback: opts.returnUrl,
          callback_method: "initiator",
        }),
        signal: AbortSignal.timeout(15000),
      }),
    );
    if (!res.ok) throw new Error(`Didit error ${res.status}: ${await res.text()}`);
    const j = (await res.json()) as { session_id: string; url?: string };
    return { provider: "Didit", sessionRef: j.session_id, url: j.url ?? null, enabled: true };
  }

  if (!features.stripeIdentity) {
    return { provider: "none", sessionRef: null, url: null, enabled: false };
  }
  const res = await traced("identity", "stripe_create_session", () =>
    fetch("https://api.stripe.com/v1/identity/verification_sessions", {
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
    }),
  );
  if (!res.ok) throw new Error(`Stripe Identity error ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { id: string; url?: string; client_secret?: string };
  return { provider: "Stripe Identity", sessionRef: j.id, url: j.url ?? null, enabled: true };
}

export async function fetchIdvResult(sessionRef: string | null): Promise<IdvResult> {
  if (!sessionRef) {
    return { status: "skipped", selfieMatch: null, livenessPassed: null, provider: "none", idName: null };
  }

  // Didit decision endpoint (v3).
  if (features.didit) {
    const res = await traced("identity", "didit_fetch_decision", () =>
      fetch(`https://verification.didit.me/v3/session/${sessionRef}/decision/`, {
        headers: { "x-api-key": env.DIDIT_API_KEY },
        signal: AbortSignal.timeout(15000),
      }),
    );
    if (!res.ok) return { status: "error", selfieMatch: null, livenessPassed: null, provider: "Didit", idName: null };
    const j = (await res.json()) as { status?: string };
    const approved = j.status === "Approved";
    const faceScore = extractFaceScore(j);
    return {
      status: approved
        ? "verified"
        : j.status === "Declined"
          ? "requires_input"
          : j.status === "In Review"
            ? "processing"
            : "skipped",
      selfieMatch: approved ? (faceScore ?? 0.99) : faceScore,
      livenessPassed: approved ? true : j.status === "Declined" ? false : null,
      provider: "Didit",
      idName: extractIdName(j),
    };
  }

  if (!features.stripeIdentity) {
    return { status: "skipped", selfieMatch: null, livenessPassed: null, provider: "none", idName: null };
  }
  const res = await traced("identity", "stripe_fetch_session", () =>
    fetch(`https://api.stripe.com/v1/identity/verification_sessions/${sessionRef}?expand[]=verified_outputs`, {
      headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(12000),
    }),
  );
  if (!res.ok) return { status: "error", selfieMatch: null, livenessPassed: null, provider: "Stripe Identity", idName: null };
  const j = (await res.json()) as { status: string; verified_outputs?: { first_name?: string; last_name?: string } };
  const verified = j.status === "verified";
  const vo = j.verified_outputs;
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
    idName: vo ? [vo.first_name, vo.last_name].filter(Boolean).join(" ") || null : null,
  };
}
