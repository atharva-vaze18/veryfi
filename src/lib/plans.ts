import { env } from "./env";

// Plan catalog. Quotas are the number of verifications included per calendar
// month. Prices are display-only — the source of truth for what a customer is
// charged is the Stripe Price you map below (STRIPE_PRICE_* in .env). Change
// quotas/prices freely; they are config, not hard-coded business logic.
export interface Plan {
  id: "free" | "starter" | "scale" | "enterprise";
  name: string;
  priceLabel: string;       // shown in the UI
  monthlyQuota: number;     // verifications/month included (Infinity for enterprise/custom)
  blurb: string;
  stripePriceId?: string;   // Stripe Price (recurring). Empty ⇒ not purchasable self-serve.
  contactSales?: boolean;
}

export const PLANS: Record<Plan["id"], Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceLabel: "$0",
    monthlyQuota: 25,
    blurb: "Evaluate the product. 25 verifications/month.",
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceLabel: "$149/mo",
    monthlyQuota: 300,
    blurb: "For active hiring. 300 verifications/month.",
    stripePriceId: env.STRIPE_PRICE_STARTER,
  },
  scale: {
    id: "scale",
    name: "Scale",
    priceLabel: "$599/mo",
    monthlyQuota: 2000,
    blurb: "High-volume teams & agencies. 2,000/month.",
    stripePriceId: env.STRIPE_PRICE_SCALE,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceLabel: "Custom",
    monthlyQuota: Number.MAX_SAFE_INTEGER,
    blurb: "SSO, custom retention/DPA, dedicated support, volume pricing.",
    contactSales: true,
  },
};

export function planFor(id: string): Plan {
  return PLANS[(id as Plan["id"]) in PLANS ? (id as Plan["id"]) : "free"];
}

// Resolve a plan from a Stripe Price id (used by the webhook to set org.plan).
export function planForStripePrice(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  return Object.values(PLANS).find((p) => p.stripePriceId && p.stripePriceId === priceId) ?? null;
}
