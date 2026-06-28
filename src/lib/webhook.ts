import { createHmac } from "node:crypto";
import { prisma } from "./db";
import { Sentry } from "./observability";

// Delivers a webhook event to all enabled endpoints subscribed to `event` for the
// given verification's org. Retries up to 3 times with exponential backoff on
// non-2xx or network error. Every attempt is logged to WebhookDelivery.
export async function deliverWebhook(
  verificationId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const v = await prisma.verification.findUnique({ where: { id: verificationId }, select: { orgId: true } });
  if (!v) return;

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { orgId: v.orgId, enabled: true },
  });

  await Promise.all(
    endpoints
      .filter((ep) => {
        try { return (JSON.parse(ep.events) as string[]).includes(event); } catch { return false; }
      })
      .map((ep) => deliverToEndpoint(ep.id, verificationId, event, payload, ep.url, ep.secret)),
  );
}

async function deliverToEndpoint(
  endpointId: string,
  verificationId: string,
  event: string,
  payload: Record<string, unknown>,
  url: string,
  secret: string,
): Promise<void> {
  const payloadJson = JSON.stringify(payload);
  const sig = sign(payloadJson, secret);

  const delivery = await prisma.webhookDelivery.create({
    data: { endpointId, verificationId, event, payloadJson, attemptCount: 0 },
  });

  const DELAYS = [0, 1000, 4000, 16000];
  let responseStatus: number | null = null;
  let responseBodySnippet: string | null = null;
  let success = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (DELAYS[attempt]! > 0) await sleep(DELAYS[attempt]!);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-veryfi-signature": sig,
          "x-veryfi-event": event,
        },
        body: payloadJson,
        signal: AbortSignal.timeout(10000),
      });
      responseStatus = res.status;
      const text = await res.text().catch(() => "");
      responseBodySnippet = text.slice(0, 500);
      success = res.ok;
      if (success) break;
    } catch (e) {
      responseBodySnippet = (e as Error).message.slice(0, 500);
    }

    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        attemptCount: attempt + 1,
        lastAttemptAt: new Date(),
        responseStatus,
        responseBodySnippet,
        success,
      },
    });
  }

  if (success) {
    await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: { lastDeliveredAt: new Date() },
    });
  } else {
    // All retries exhausted — surface to Sentry so a recipient whose endpoint
    // is consistently down shows up in the alert stream rather than silently
    // burning attempts. PII (signed payload) is intentionally excluded.
    Sentry.captureException(new Error("webhook_delivery_exhausted"), {
      tags: { event, endpointId },
      extra: { url, verificationId, lastStatus: responseStatus },
    });
  }
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
