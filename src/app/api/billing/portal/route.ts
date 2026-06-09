import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { stripe } from "@/lib/billing";
import { env, isSuperAdmin } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open the Stripe Customer Portal so the owner can change card / cancel / view invoices.
export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (session.role !== "owner" && session.role !== "admin" && !isSuperAdmin(session.email)) {
    return NextResponse.json({ error: "Only owners and admins can manage billing." }, { status: 403 });
  }
  const s = stripe();
  if (!s) return NextResponse.json({ error: "Billing is not configured." }, { status: 501 });

  const org = await prisma.org.findUnique({ where: { id: session.orgId } });
  if (!org?.stripeCustomerId) {
    return NextResponse.json({ error: "No subscription yet. Choose a plan first." }, { status: 400 });
  }
  const portal = await s.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${env.APP_URL}/settings/billing`,
  });
  return NextResponse.json({ url: portal.url });
}
