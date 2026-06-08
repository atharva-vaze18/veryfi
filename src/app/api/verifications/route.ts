import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Create = z.object({
  candidateName: z.string().min(1),
  candidateEmail: z.string().email(),
  roleContext: z.string().max(200).optional().default(""),
  declaredCountry: z.string().max(2).optional().default(""),
});

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const rows = await prisma.verification.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
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

  const v = await prisma.verification.create({
    data: {
      orgId: session.orgId,
      candidateName: parsed.data.candidateName,
      candidateEmail: parsed.data.candidateEmail,
      roleContext: parsed.data.roleContext ?? "",
      declaredCountry: (parsed.data.declaredCountry ?? "").toUpperCase(),
      status: "pending",
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
  return NextResponse.json(
    { id: v.id, token: v.token, candidateLink: `${env.APP_URL}/v/${v.token}` },
    { status: 201 },
  );
}
