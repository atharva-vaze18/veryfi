import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { prisma } from "@/lib/db";
import {
  signSession,
  setSessionCookie,
  getMfaPendingUserId,
  clearMfaPendingCookie,
} from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/request";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ code: z.string().min(6).max(32) });

// Exchanges a TOTP code (or a backup code) for a real session cookie.
// The user must already hold the short-lived mfa_pending cookie issued by
// /api/auth/login when mfaEnabled was true. Backup codes are single-use:
// matched ones are removed from the stored list after a successful exchange.
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`mfa:${ip}`, 10, 5 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const userId = getMfaPendingUserId();
  if (!userId) return NextResponse.json({ error: "mfa_pending_missing" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { org: true } });
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    return NextResponse.json({ error: "mfa_not_enabled" }, { status: 409 });
  }

  const code = parsed.data.code.trim();
  let accepted = false;
  let usedBackup = false;

  // Try TOTP first; it's the common path.
  if (/^\d{6}$/.test(code)) {
    accepted = authenticator.check(code, user.mfaSecret);
  }

  // Backup-code path. Each code is bcrypt-hashed; on match, splice it out so
  // it can't be replayed.
  if (!accepted && user.mfaBackupCodes) {
    try {
      const hashes = JSON.parse(user.mfaBackupCodes) as string[];
      for (let i = 0; i < hashes.length; i++) {
        if (await bcrypt.compare(code, hashes[i]!)) {
          accepted = true; usedBackup = true;
          hashes.splice(i, 1);
          await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: JSON.stringify(hashes) } });
          break;
        }
      }
    } catch { /* malformed JSON — treat as no backup codes */ }
  }

  if (!accepted) return NextResponse.json({ error: "invalid_code" }, { status: 400 });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const session = {
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: !!user.emailVerifiedAt,
  };
  setSessionCookie(signSession(session));
  clearMfaPendingCookie();

  await audit({
    orgId: user.orgId,
    actor: user.id,
    action: usedBackup ? "auth.mfa_backup_used" : "auth.mfa_challenge_passed",
    entityType: "User",
    entityId: user.id,
  });

  return NextResponse.json({ user: { ...session, orgName: user.org.name } });
}
