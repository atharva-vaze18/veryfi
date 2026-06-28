import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().min(6).max(8) });

// Confirms the user successfully scanned the QR and entered a live code.
// On success flips mfaEnabled=true and returns 8 single-use backup codes
// (recovery for a lost authenticator). Backup codes are bcrypt-hashed before
// storage; the plaintext is returned ONLY in this response and never again.
export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.mfaSecret) return NextResponse.json({ error: "mfa_not_started" }, { status: 409 });
  if (user.mfaEnabled) return NextResponse.json({ error: "mfa_already_enabled" }, { status: 409 });

  const ok = authenticator.check(parsed.data.code, user.mfaSecret);
  if (!ok) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(8).toString("hex"));
  const hashed = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 10)));

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true, mfaBackupCodes: JSON.stringify(hashed) },
  });

  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "auth.mfa_enabled",
    entityType: "User",
    entityId: session.userId,
  });

  return NextResponse.json({ ok: true, backupCodes });
}
