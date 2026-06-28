import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { usageStatus } from "@/lib/billing";
import { finalizeDeepfake } from "@/lib/deepfake-finalize";
import { newCandidateToken, defaultLinkExpiry } from "@/lib/token";
import { rateLimit } from "@/lib/ratelimit";
import { sendCandidateInvite } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Create = z.object({
  candidateName: z.string().min(1),
  candidateEmail: z.string().email(),
  roleContext: z.string().max(200).optional().default(""),
  declaredCountry: z.string().max(2).optional().default(""),
  // Opt-out: defaults to sending the candidate their link by email.
  sendInvite: z.boolean().optional().default(true),
});

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const rows = await prisma.verification.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  // Resolve any pending deepfake analyses (async pipeline) — capped so a poll stays fast.
  const pending = rows.filter((r) => r.deepfakeRequestId).slice(0, 5);
  if (pending.length) {
    await Promise.all(pending.map((r) => finalizeDeepfake(r).catch(() => null)));
    if (pending.length) {
      const refreshed = await prisma.verification.findMany({ where: { id: { in: pending.map((r) => r.id) } } });
      const byId = new Map(refreshed.map((r) => [r.id, r]));
      for (let i = 0; i < rows.length; i++) { const u = byId.get(rows[i]!.id); if (u) rows[i] = u; }
    }
  }
  const list = rows.map((v) => ({
    id: v.id,
    candidateName: v.candidateName,
    candidateEmail: v.candidateEmail,
    roleContext: v.roleContext,
    status: v.status,
    riskScore: v.riskScore,
    band: v.band,
    verdict: v.verdict,
    createdAt: v.createdAt,
    completedAt: v.completedAt,
  }));
  const completed = list.filter((v) => v.band);
  const stats = {
    total: list.length,
    pending: list.filter((v) => v.status !== "complete").length,
    thisMonth: list.filter((v) => new Date(v.createdAt).getMonth() === new Date().getMonth()).length,
    flagged: list.filter((v) => v.band === "risk").length,
    review: list.filter((v) => v.band === "review").length,
    pass: list.filter((v) => v.band === "pass").length,
  };
  return NextResponse.json({ verifications: list, stats });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Abuse guard: one account (scripted or compromised) can't mint unlimited links /
  // paid provider sessions in a burst. The monthly quota below is the spend wall.
  const rl = await rateLimit(`vcreate:${session.userId}`, 30, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Too many verifications created — retry in ${rl.retryAfterSec}s.` }, { status: 429 });
  }

  // Usage metering: block once the org is over its monthly quota (always enforced;
  // super-admins are unlimited).
  const usage = await usageStatus(session.orgId, session.email);
  if (usage.blocked) {
    return NextResponse.json(
      { error: `Monthly limit reached (${usage.usage}/${usage.quota} on the ${usage.plan} plan). Upgrade to keep verifying.`, code: "quota_exceeded", usage },
      { status: 402 },
    );
  }

  const v = await prisma.verification.create({
    data: {
      orgId: session.orgId,
      candidateName: parsed.data.candidateName,
      candidateEmail: parsed.data.candidateEmail,
      roleContext: parsed.data.roleContext ?? "",
      declaredCountry: (parsed.data.declaredCountry ?? "").toUpperCase(),
      status: "pending",
      token: newCandidateToken(),
      expiresAt: defaultLinkExpiry(),
    },
  });
  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "verification.created",
    entityType: "Verification",
    entityId: v.id,
    payload: { candidateEmail: v.candidateEmail },
  });

  const candidateLink = `${env.APP_URL}/v/${v.token}`;

  // Fire-and-forget invite. Errors are logged + audited but never block the
  // response — the recruiter can always copy the link from the UI as a fallback.
  if (parsed.data.sendInvite) {
    const org = await prisma.org.findUnique({ where: { id: session.orgId }, select: { name: true } });
    sendCandidateInvite(v.candidateEmail, v.candidateName, candidateLink, org?.name ?? "Your hiring team")
      .then((r) => {
        if (!r.ok) console.error("candidate_invite_email_failed", r.error);
        return audit({
          orgId: session.orgId,
          actor: session.userId,
          action: "verification.invite_sent",
          entityType: "Verification",
          entityId: v.id,
          payload: { to: v.candidateEmail, delivered: r.ok, error: r.ok ? null : r.error },
        });
      })
      .catch((e) => console.error("candidate_invite_audit_failed", (e as Error).message));
  }

  return NextResponse.json(
    { id: v.id, token: v.token, candidateLink },
    { status: 201 },
  );
}
