import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

export interface GreenhouseConfig {
  harvestApiKey: string;
  webhookSecret: string;
  triggerStageId: string;
  jobIds: string[];
  autoPostNote: boolean;
}

export interface GreenhouseApplication {
  id: number;
  candidate_id: number;
  status: string;
  current_stage?: { id: number; name: string };
  jobs?: Array<{ id: number; name: string }>;
}

export interface GreenhouseCandidate {
  id: number;
  first_name: string;
  last_name: string;
  email_addresses?: Array<{ value: string; type: string }>;
}

// Fetches active applications from Greenhouse Harvest API.
export async function fetchGreenhouseApplications(apiKey: string): Promise<GreenhouseApplication[]> {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch("https://harvest.greenhouse.io/v1/applications?status=active&per_page=100", {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Greenhouse API error: ${res.status}`);
  return res.json() as Promise<GreenhouseApplication[]>;
}

// Fetches a candidate record from Greenhouse.
export async function fetchGreenhouseCandidate(apiKey: string, candidateId: number): Promise<GreenhouseCandidate> {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch(`https://harvest.greenhouse.io/v1/candidates/${candidateId}`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Greenhouse candidate fetch error: ${res.status}`);
  return res.json() as Promise<GreenhouseCandidate>;
}

// Validates the org name/info via the Harvest API (used for "test connection").
export async function fetchGreenhouseOrgInfo(apiKey: string): Promise<{ name: string }> {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch("https://harvest.greenhouse.io/v1/users?per_page=1", {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Greenhouse API error ${res.status}: check your Harvest API key.`);
  // Greenhouse doesn't expose an /org endpoint — a successful users call proves auth.
  return { name: "Connected" };
}

// Fetches job stages from Greenhouse.
export async function fetchGreenhouseStages(apiKey: string): Promise<Array<{ id: number; name: string }>> {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const res = await fetch("https://harvest.greenhouse.io/v1/stages", {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Greenhouse stages fetch error: ${res.status}`);
  const data = await res.json() as Array<{ id: number; name: string }>;
  return data;
}

// Creates a Veryfi Verification for a Greenhouse application.
export async function createVerificationForCandidate(
  application: GreenhouseApplication,
  candidate: GreenhouseCandidate,
  orgId: string,
): Promise<{ id: string; token: string; candidateLink: string }> {
  const email = candidate.email_addresses?.find((e) => e.type === "work")?.value
    ?? candidate.email_addresses?.[0]?.value
    ?? `candidate-${candidate.id}@greenhouse.noemail`;

  const v = await prisma.verification.create({
    data: {
      orgId,
      candidateName: `${candidate.first_name} ${candidate.last_name}`.trim(),
      candidateEmail: email,
      roleContext: application.jobs?.[0]?.name ?? "",
      status: "pending",
    },
  });

  await audit({
    orgId,
    actor: "integration:greenhouse",
    action: "verification.created",
    entityType: "Verification",
    entityId: v.id,
    payload: { source: "greenhouse", applicationId: application.id },
  });

  return { id: v.id, token: v.token, candidateLink: `${env.APP_URL}/v/${v.token}` };
}

// Posts a note to a Greenhouse application via Harvest API.
export async function postGreenhouseNote(apiKey: string, applicationId: number, body: string): Promise<void> {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  // Greenhouse note POST requires a user_id; use the first user available.
  const usersRes = await fetch("https://harvest.greenhouse.io/v1/users?per_page=1", {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!usersRes.ok) return;
  const users = await usersRes.json() as Array<{ id: number }>;
  const userId = users[0]?.id;
  if (!userId) return;

  await fetch(`https://harvest.greenhouse.io/v1/applications/${applicationId}/activity_feed/notes`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "content-type": "application/json", "on-behalf-of": String(userId) },
    body: JSON.stringify({ body, visibility: "admin_only" }),
    signal: AbortSignal.timeout(8000),
  });
}

// Verifies Greenhouse webhook HMAC-SHA256 signature.
// Greenhouse signs with HMAC-SHA256 of the raw body using the webhook secret.
export function verifyGreenhouseSignature(rawBody: string, signature: string, secret: string): boolean {
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// Handles an incoming Greenhouse stage_change webhook event.
export async function handleGreenhouseWebhook(
  rawBody: string,
  signature: string,
  orgId: string,
  config: GreenhouseConfig,
): Promise<{ created: boolean; verificationId?: string }> {
  if (!verifyGreenhouseSignature(rawBody, signature, config.webhookSecret)) {
    throw new Error("Invalid webhook signature");
  }

  const payload = JSON.parse(rawBody) as {
    action?: string;
    payload?: {
      application?: GreenhouseApplication;
      new_stage?: { id: number; name: string };
    };
  };

  if (payload.action !== "candidate_stage_change") return { created: false };

  const newStageId = String(payload.payload?.new_stage?.id ?? "");
  if (newStageId !== config.triggerStageId) return { created: false };

  const application = payload.payload?.application;
  if (!application) return { created: false };

  // Optionally filter by job IDs.
  if (config.jobIds.length > 0) {
    const appJobIds = (application.jobs ?? []).map((j) => String(j.id));
    const matches = appJobIds.some((id) => config.jobIds.includes(id));
    if (!matches) return { created: false };
  }

  const candidate = await fetchGreenhouseCandidate(config.harvestApiKey, application.candidate_id);
  const result = await createVerificationForCandidate(application, candidate, orgId);

  if (config.autoPostNote) {
    await postGreenhouseNote(
      config.harvestApiKey,
      application.id,
      `Veryfi fraud check initiated — candidate link: ${result.candidateLink}`,
    ).catch(() => {});
  }

  return { created: true, verificationId: result.id };
}
