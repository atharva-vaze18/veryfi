import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticator } from "otplib";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().min(6).max(8) });

// Turn MFA off. Owners and admins only — members cannot disable their own MFA
// independently (we want defense-in-depth on the people with the most blast
// radius). Requires a valid TOTP code so a stolen session alone can't strip
// the second factor.
export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Owner or admin required" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    return NextResponse.json({ error: "mfa_not_enabled" }, { status: 409 });
  }
  if (!authenticator.check(parsed.data.code, user.mfaSecret)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: null },
  });

  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "auth.mfa_disabled",
    entityType: "User",
    entityId: session.userId,
  });

  return NextResponse.json({ ok: true });
}
