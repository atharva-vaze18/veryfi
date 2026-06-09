import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { usageStatus } from "@/lib/billing";
import { PLANS } from "@/lib/plans";
import { features } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Current plan, usage vs quota, and the catalog the billing page renders.
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const status = await usageStatus(session.orgId);
  const plans = Object.values(PLANS).map((p) => ({
    id: p.id,
    name: p.name,
    priceLabel: p.priceLabel,
    monthlyQuota: p.monthlyQuota === Number.MAX_SAFE_INTEGER ? null : p.monthlyQuota,
    blurb: p.blurb,
    purchasable: Boolean(p.stripePriceId) && features.billing,
    contactSales: Boolean(p.contactSales),
  }));
  return NextResponse.json({
    ...status,
    billingEnabled: features.billing,
    canManage: session.role === "owner" || session.role === "admin",
    plans,
  });
}
