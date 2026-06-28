import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { CONSENT_DOCS } from "@/lib/consent";
import { getClientIp, docHash } from "@/lib/request";
import { audit } from "@/lib/audit";
import { linkState, linkDeadMessage } from "@/lib/token";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const Body = z.object({
  type: z.enum(["DATA_PROCESSING", "BIOMETRIC"]),
  version: z.string(),
  fullNameTyped: z.string().min(2),
  agreed: z.literal(true),
});

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const rl = await rateLimit(`cand:consent:${params.token}:${getClientIp(req)}`, 20, 5 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const v = await prisma.verification.findUnique({ where: { token: params.token } });
  if (!v) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (v.status === "complete") return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  const state = linkState(v);
  if (state !== "active") return NextResponse.json({ error: linkDeadMessage(state) }, { status: 410 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const doc = CONSENT_DOCS[parsed.data.type];
  if (doc.version !== parsed.data.version) {
    return NextResponse.json({ error: "Consent version mismatch — reload." }, { status: 409 });
  }

  await prisma.consent.create({
    data: {
      verificationId: v.id,
      type: doc.type,
      documentVersion: doc.version,
      documentHash: docHash(doc.version, doc.body, doc.retentionPolicy),
      fullNameTyped: parsed.data.fullNameTyped,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get("user-agent") ?? "",
      retentionPolicy: doc.retentionPolicy,
    },
  });
  if (v.status === "pending") await prisma.verification.update({ where: { id: v.id }, data: { status: "consented" } });
  await audit({
    orgId: v.orgId,
    actor: `candidate:${params.token.slice(0, 8)}`,
    action: "consent.signed",
    entityType: "Verification",
    entityId: v.id,
    payload: { type: doc.type, version: doc.version },
  });
  return NextResponse.json({ ok: true, type: doc.type });
}
