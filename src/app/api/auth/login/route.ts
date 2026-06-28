import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, signSession, setSessionCookie, signMfaPending, setMfaPendingCookie } from "@/lib/auth";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  // Throttle brute force: max 10 attempts per IP+email per 5 minutes.
  const ip = getClientIp(req);
  const rl = await rateLimit(`login:${ip}:${parsed.data.email.toLowerCase()}`, 10, 5 * 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, include: { org: true } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // MFA gate: when enabled, do NOT issue a real session — instead set a
  // short-lived mfa_pending cookie. The client posts a TOTP code (or backup
  // code) to /api/auth/mfa/challenge which trades it for the real session.
  if (user.mfaEnabled) {
    setMfaPendingCookie(signMfaPending(user.id));
    return NextResponse.json({ mfaRequired: true });
  }

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
  return NextResponse.json({ user: { ...session, orgName: user.org.name } });
}
