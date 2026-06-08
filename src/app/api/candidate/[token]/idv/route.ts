import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env, features } from "@/lib/env";
import { createIdvSession } from "@/adapters/identity";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const Body = z.object({ action: z.enum(["start"]) });

// Starts a REAL Stripe Identity session when configured. When not configured,
// returns enabled:false and the candidate flow skips the ID step honestly.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const v = await prisma.verification.findUnique({ where: { token: params.token }, include: { consents: true } });
  if (!v) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => ({ action: "start" })));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // Gate ID/biometric step on biometric consent.
  const hasBiometric = v.consents.some((c) => c.type === "BIOMETRIC");
  if (!hasBiometric) return NextResponse.json({ error: "Biometric consent required first" }, { status: 403 });

  if (!features.didit && !features.stripeIdentity) {
    return NextResponse.json({ enabled: false, provider: "none", url: null });
  }
  try {
    const sess = await createIdvSession({
      verificationId: v.id,
      returnUrl: `${env.APP_URL}/v/${params.token}?idv=return`,
    });
    await prisma.verification.update({
      where: { id: v.id },
      data: { idvProvider: sess.provider, idvSessionRef: sess.sessionRef, idvStatus: "processing" },
    });
    await audit({ orgId: v.orgId, actor: `candidate:${params.token.slice(0, 8)}`, action: "idv.started", entityType: "Verification", entityId: v.id, payload: { provider: sess.provider } });
    return NextResponse.json({ enabled: true, provider: sess.provider, url: sess.url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
