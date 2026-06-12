import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { env, features } from "@/lib/env";
import { createIdvSession, fetchIdvResult } from "@/adapters/identity";
import { audit } from "@/lib/audit";
import { linkState, linkDeadMessage } from "@/lib/token";
import { rateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ action: z.enum(["start"]) });

// Polled by the embedded ID flow to detect when the candidate has finished.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const v = await prisma.verification.findUnique({ where: { token: params.token } });
  if (!v) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  const result = await fetchIdvResult(v.idvSessionRef);
  // terminal = candidate finished (passed or failed); "processing"/"skipped" = still going / not started
  const done = result.status === "verified" || result.status === "requires_input";
  return NextResponse.json({ status: result.status, done });
}

// Starts a REAL Stripe Identity session when configured. When not configured,
// returns enabled:false and the candidate flow skips the ID step honestly.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  // IDV sessions cost real money per check — keep this strictly behind a live,
  // un-submitted token and a tight rate limit.
  const rl = rateLimit(`cand:idv:${params.token}:${getClientIp(req)}`, 10, 5 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const v = await prisma.verification.findUnique({ where: { token: params.token }, include: { consents: true } });
  if (!v) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (v.status === "complete") return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  const state = linkState(v);
  if (state !== "active") return NextResponse.json({ error: linkDeadMessage(state) }, { status: 410 });

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
