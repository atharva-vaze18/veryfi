import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { newCandidateToken, defaultLinkExpiry } from "@/lib/token";

export interface LeverConfig {
  apiKey: string;
  webhookSecret: string;
  triggerStageId: string;
  autoPostNote: boolean;
}

export interface LeverOpportunity {
  id: string;
  name?: string;
  emails?: string[];
  stage?: string;
  contact?: string;
  posting?: string;
  postings?: string[];
  origin?: string;
}

export interface LeverStage {
  id: string;
  text: string;
}

const LEVER_BASE = "https://api.lever.co/v1";

function basicAuth(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

// Lever's API uses HTTP Basic auth with the API key as the username and an
// empty password. Org info is implicit in the credential.
export async function fetchLeverOpportunities(apiKey: string, stageId?: string): Promise<LeverOpportunity[]> {
  const qs = stageId ? `?stage_id=${encodeURIComponent(stageId)}&limit=100` : "?limit=100";
  const res = await fetch(`${LEVER_BASE}/opportunities${qs}`, {
    headers: { Authorization: basicAuth(apiKey) },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Lever API error: ${res.status}`);
  const j = (await res.json()) as { data?: LeverOpportunity[] };
  return j.data ?? [];
}

// "Test connection" probe — a successful stages fetch proves auth.
export async function fetchLeverOrgInfo(apiKey: string): Promise<{ name: string }> {
  const res = await fetch(`${LEVER_BASE}/stages?limit=1`, {
    headers: { Authorization: basicAuth(apiKey) },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Lever API error ${res.status}: check your API key.`);
  return { name: "Connected" };
}

export async function fetchLeverStages(apiKey: string): Promise<LeverStage[]> {
  const res = await fetch(`${LEVER_BASE}/stages?limit=100`, {
    headers: { Authorization: basicAuth(apiKey) },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Lever stages fetch error: ${res.status}`);
  const j = (await res.json()) as { data?: LeverStage[] };
  return j.data ?? [];
}

// Spawns a Veryfi Verification from a Lever opportunity.
export async function createVerificationForOpportunity(
  opportunity: LeverOpportunity,
  orgId: string,
): Promise<{ id: string; token: string; candidateLink: string }> {
  const email = opportunity.emails?.[0] ?? `candidate-${opportunity.id}@lever.noemail`;
  const name = opportunity.name?.trim() || "Lever candidate";
  const v = await prisma.verification.create({
    data: {
      orgId,
      candidateName: name,
      candidateEmail: email,
      roleContext: opportunity.posting ?? opportunity.postings?.[0] ?? "",
      status: "pending",
      token: newCandidateToken(),
      expiresAt: defaultLinkExpiry(),
    },
  });
  await audit({
    orgId,
    actor: "integration:lever",
    action: "verification.created",
    entityType: "Verification",
    entityId: v.id,
    payload: { source: "lever", opportunityId: opportunity.id },
  });
  return { id: v.id, token: v.token, candidateLink: `${env.APP_URL}/v/${v.token}` };
}

// Posts a confidential note to a Lever opportunity.
export async function postLeverNote(apiKey: string, opportunityId: string, noteText: string): Promise<void> {
  await fetch(`${LEVER_BASE}/opportunities/${encodeURIComponent(opportunityId)}/notes`, {
    method: "POST",
    headers: { Authorization: basicAuth(apiKey), "content-type": "application/json" },
    body: JSON.stringify({ value: noteText }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => { /* note failure shouldn't abort the integration */ });
}

// Lever signs webhooks with HMAC-SHA256 over the raw request body using the
// configured webhook secret. Header: `lever-signature` (hex digest).
export function verifyLeverSignature(rawBody: string, signature: string, secret: string): boolean {
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// Handles an incoming Lever stageChange webhook.
export async function handleLeverWebhook(
  rawBody: string,
  signature: string,
  orgId: string,
  config: LeverConfig,
): Promise<{ created: boolean; verificationId?: string }> {
  if (!verifyLeverSignature(rawBody, signature, config.webhookSecret)) {
    throw new Error("Invalid webhook signature");
  }
  const payload = JSON.parse(rawBody) as {
    event?: string;
    triggeredAt?: number;
    data?: {
      opportunityId?: string;
      toStageId?: string;
      contactId?: string;
    };
    opportunity?: LeverOpportunity;
  };
  if (payload.event !== "candidateStageChange" && payload.event !== "stageChange") return { created: false };
  const newStageId = payload.data?.toStageId ?? "";
  if (newStageId !== config.triggerStageId) return { created: false };

  // The webhook usually carries the opportunity inline; if not, fetch it.
  let opportunity = payload.opportunity;
  if (!opportunity && payload.data?.opportunityId) {
    const res = await fetch(`${LEVER_BASE}/opportunities/${payload.data.opportunityId}`, {
      headers: { Authorization: basicAuth(config.apiKey) },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const j = (await res.json()) as { data?: LeverOpportunity };
      opportunity = j.data;
    }
  }
  if (!opportunity) return { created: false };

  const result = await createVerificationForOpportunity(opportunity, orgId);
  if (config.autoPostNote) {
    await postLeverNote(
      config.apiKey,
      opportunity.id,
      `Veryfi fraud check initiated — candidate link: ${result.candidateLink}`,
    );
  }
  return { created: true, verificationId: result.id };
}
