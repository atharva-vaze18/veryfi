import Stripe from "stripe";
import { prisma } from "./db";
import { env, features } from "./env";
import { planFor } from "./plans";

// Single Stripe client, created lazily and only when configured.
let _stripe: Stripe | null = null;
export function stripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) _stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });
  return _stripe;
}

// First instant of the current calendar month (UTC) — the metering window.
export function monthStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export interface UsageStatus {
  usage: number;       // verifications created this month
  quota: number;       // included this month
  plan: string;
  metered: boolean;    // is billing enforcement active?
  blocked: boolean;    // would the next verification be blocked?
  remaining: number;
}

export async function usageStatus(orgId: string): Promise<UsageStatus> {
  const org = await prisma.org.findUnique({ where: { id: orgId } });
  const quota = org?.monthlyQuota ?? planFor(org?.plan ?? "free").monthlyQuota;
  const usage = await prisma.verification.count({
    where: { orgId, createdAt: { gte: monthStart() } },
  });
  const metered = features.billing;
  return {
    usage,
    quota,
    plan: org?.plan ?? "free",
    metered,
    blocked: metered && usage >= quota,
    remaining: Math.max(0, quota - usage),
  };
}
