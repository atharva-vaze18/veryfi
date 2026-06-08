import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { features } from "@/lib/env";
import { CONSENT_DOCS, CONSENT_ORDER } from "@/lib/consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Candidate-facing state (no auth — token is the capability).
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const v = await prisma.verification.findUnique({
    where: { token: params.token },
    include: { consents: true },
  });
  if (!v) return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  const signed = new Set(v.consents.map((c) => c.type));
  return NextResponse.json({
    candidateName: v.candidateName,
    roleContext: v.roleContext,
    status: v.status,
    complete: v.status === "complete",
    idvEnabled: features.didit || features.stripeIdentity,
    idvStatus: v.idvStatus,
    consents: CONSENT_ORDER.map((t) => {
      const d = CONSENT_DOCS[t];
      return { type: d.type, version: d.version, title: d.title, body: d.body, retentionPolicy: d.retentionPolicy, signed: signed.has(d.type) };
    }),
    allConsentsSigned: CONSENT_ORDER.every((t) => signed.has(t)),
  });
}
