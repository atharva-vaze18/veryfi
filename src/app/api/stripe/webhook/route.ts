import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/billing";
import { planFor, planForStripePrice, PLANS } from "@/lib/plans";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe -> us. Verified by signature; keeps org.plan / quota / billingStatus in
// sync with the real subscription so metering can't be bypassed by the client.
export async function POST(req: Request) {
  const s = stripe();
  if (!s || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 501 });
  }
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = s.webhooks.constructEvent(raw, sig ?? "", env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 });
  }

  async function applySubscription(sub: Stripe.Subscription) {
    const orgId = (sub.metadata?.orgId as string) || null;
    const priceId = sub.items.data[0]?.price?.id ?? null;
    const plan = planForStripePrice(priceId) ?? planFor("free");
    const where = orgId ? { id: orgId } : { stripeCustomerId: String(sub.customer) };
    const active = sub.status === "active" || sub.status === "trialing";
    const billingStatus = active ? "active" : sub.status === "past_due" ? "past_due" : "canceled";
    const targetPlan = active ? plan : PLANS.free;
    await prisma.org.updateMany({
      where,
      data: {
        plan: targetPlan.id,
        monthlyQuota: targetPlan.monthlyQuota,
        billingStatus,
        stripeSubId: sub.id,
        stripeCustomerId: String(sub.customer),
      },
    });
    await audit({
      orgId: orgId ?? undefined,
      actor: "stripe",
      action: "billing.subscription_synced",
      entityType: "Org",
      entityId: orgId ?? String(sub.customer),
      payload: { status: sub.status, plan: targetPlan.id, priceId },
    });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const cs = event.data.object as Stripe.Checkout.Session;
      if (cs.subscription) {
        const sub = await s.subscriptions.retrieve(String(cs.subscription));
        if (!sub.metadata?.orgId && cs.client_reference_id) sub.metadata = { ...sub.metadata, orgId: cs.client_reference_id };
        await applySubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applySubscription(event.data.object as Stripe.Subscription);
      break;
    default:
      break;
  }
  return NextResponse.json({ received: true });
}
