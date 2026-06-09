import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Update = z.object({
  weightsJson: z.string(),
  bandThresholds: z.string(),
  useGlobalDefaults: z.boolean(),
});

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const profile = await prisma.scoringProfile.findUnique({ where: { orgId: session.orgId } });
  if (!profile) {
    return NextResponse.json({
      weightsJson: "{}",
      bandThresholds: JSON.stringify({ pass: 20, review: 45 }),
      useGlobalDefaults: true,
    });
  }

  return NextResponse.json({
    weightsJson: profile.weightsJson,
    bandThresholds: profile.bandThresholds,
    useGlobalDefaults: profile.useGlobalDefaults,
  });
}

export async function PUT(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const parsed = Update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Validate that weightsJson and bandThresholds are valid JSON.
  try { JSON.parse(parsed.data.weightsJson); } catch { return NextResponse.json({ error: "weightsJson must be valid JSON" }, { status: 400 }); }
  try { JSON.parse(parsed.data.bandThresholds); } catch { return NextResponse.json({ error: "bandThresholds must be valid JSON" }, { status: 400 }); }

  await prisma.scoringProfile.upsert({
    where: { orgId: session.orgId },
    update: {
      weightsJson: parsed.data.weightsJson,
      bandThresholds: parsed.data.bandThresholds,
      useGlobalDefaults: parsed.data.useGlobalDefaults,
    },
    create: {
      orgId: session.orgId,
      weightsJson: parsed.data.weightsJson,
      bandThresholds: parsed.data.bandThresholds,
      useGlobalDefaults: parsed.data.useGlobalDefaults,
    },
  });

  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "scoring_profile.updated",
    entityType: "ScoringProfile",
    entityId: session.orgId,
  });

  return NextResponse.json({ ok: true });
}
