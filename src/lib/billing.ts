import Stripe from "stripe";
import { prisma } from "./db";
import { env, isSuperAdmin } from "./env";
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
  metered: boolean;    // is a quota enforced? (false only for super-admin / unlimited)
  blocked: boolean;    // would the next verification be blocked?
  remaining: number;
  unlimited: boolean;
}

// Usage metering is ALWAYS on. Pass the requesting user's email so super-admins
// get unlimited usage (never blocked).
export async function usageStatus(orgId: string, email?: string | null): Promise<UsageStatus> {
  const org = await prisma.org.findUnique({ where: { id: orgId } });
  const quota = org?.monthlyQuota ?? planFor(org?.plan ?? "free").monthlyQuota;
  const usage = await prisma.verification.count({
    where: { orgId, createdAt: { gte: monthStart() } },
  });
  const unlimited = isSuperAdmin(email);
  return {
    usage,
    quota,
    plan: unlimited ? "unlimited" : org?.plan ?? "free",
    metered: !unlimited,
    blocked: !unlimited && usage >= quota,
    remaining: unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, quota - usage),
    unlimited,
  };
}
