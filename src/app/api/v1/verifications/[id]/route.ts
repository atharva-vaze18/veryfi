import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveApiKey, ApiKeyError } from "@/lib/apikey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  let orgId: string;
  try { ({ orgId } = await resolveApiKey(req)); } catch (e) {
    return NextResponse.json({ error: (e as ApiKeyError).message }, { status: 401 });
  }

  const v = await prisma.verification.findUnique({ where: { id: params.id } });
  if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (v.orgId !== orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const signals = (() => { try { return JSON.parse(v.signalsJson ?? "[]"); } catch { return []; } })();

  return NextResponse.json({
    id: v.id,
    candidateName: v.candidateName,
    candidateEmail: v.candidateEmail,
    roleContext: v.roleContext,
    status: v.status,
    band: v.band,
    riskScore: v.riskScore,
    verdict: v.verdict,
    signals,
    createdAt: v.createdAt,
    completedAt: v.completedAt,
  });
}
