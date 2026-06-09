import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveApiKey, ApiKeyError } from "@/lib/apikey";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Create = z.object({
  candidateName: z.string().min(1),
  candidateEmail: z.string().email(),
  roleContext: z.string().max(200).optional().default(""),
  declaredCountry: z.string().max(2).optional().default(""),
});

export async function GET(req: Request) {
  let orgId: string;
  try { ({ orgId } = await resolveApiKey(req)); } catch (e) {
    return NextResponse.json({ error: (e as ApiKeyError).message }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));

  const [total, rows] = await Promise.all([
    prisma.verification.count({ where: { orgId } }),
    prisma.verification.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, candidateName: true, candidateEmail: true, roleContext: true,
        status: true, band: true, riskScore: true, verdict: true, createdAt: true, completedAt: true,
      },
    }),
  ]);

  return NextResponse.json({ verifications: rows, page, limit, total });
}

export async function POST(req: Request) {
  let orgId: string;
  try { ({ orgId } = await resolveApiKey(req)); } catch (e) {
    return NextResponse.json({ error: (e as ApiKeyError).message }, { status: 401 });
  }

  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const v = await prisma.verification.create({
    data: {
      orgId,
      candidateName: parsed.data.candidateName,
      candidateEmail: parsed.data.candidateEmail,
      roleContext: parsed.data.roleContext ?? "",
      declaredCountry: (parsed.data.declaredCountry ?? "").toUpperCase(),
      status: "pending",
    },
  });

  await audit({
    orgId,
    actor: `apikey`,
    action: "verification.created",
    entityType: "Verification",
    entityId: v.id,
    payload: { candidateEmail: v.candidateEmail, source: "api" },
  });

  return NextResponse.json(
    { id: v.id, token: v.token, candidateLink: `${env.APP_URL}/v/${v.token}` },
    { status: 201 },
  );
}
