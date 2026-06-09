import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { stripe } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { env, features } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ plan: z.enum(["starter", "scale"]) });

// Start a Stripe Checkout subscription for the chosen plan. Owners/admins only.
export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can change the plan." }, { status: 403 });
  }
  const s = stripe();
  if (!s || !features.billing) {
    return NextResponse.json({ error: "Self-serve billing is not configured yet." }, { status: 501 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const plan = PLANS[parsed.data.plan];
  if (!plan.stripePriceId) return NextResponse.json({ error: "That plan is not purchasable." }, { status: 400 });

  const org = await prisma.org.findUnique({ where: { id: session.orgId } });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  // Reuse the org's Stripe customer if we have one, else let Checkout create it.
  let customerId = org.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await s.customers.create({
      email: session.email,
      name: org.name,
      metadata: { orgId: org.id },
    });
    customerId = customer.id;
    await prisma.org.update({ where: { id: org.id }, data: { stripeCustomerId: customerId } });
  }

  const checkout = await s.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    client_reference_id: org.id,
    subscription_data: { metadata: { orgId: org.id, plan: plan.id } },
    success_url: `${env.APP_URL}/settings/billing?upgraded=1`,
    cancel_url: `${env.APP_URL}/settings/billing?canceled=1`,
    allow_promotion_codes: true,
  });
  return NextResponse.json({ url: checkout.url });
}
