import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { sendEmailVerification } from "@/lib/email";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resend the email-verification link for the current session's user.
// Auth required so a stranger can't probe whether an email has signed up.
// Rate limited at 3/hour per email to blunt cost abuse on Resend.
export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (session.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  const rl = rateLimit(`resend-verify:${session.email.toLowerCase()}`, 3, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Too many requests — try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.user.update({
    where: { id: session.userId },
    data: {
      emailVerifyToken: token,
      emailVerifyTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });

  const verifyUrl = `${env.APP_URL}/api/auth/verify-email?token=${token}`;
  const result = await sendEmailVerification(session.email, verifyUrl);
  if (!result.ok) console.error("email_verification_resend_failed", result.error);

  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "auth.verification_email_resent",
    entityType: "User",
    entityId: session.userId,
    payload: { delivered: result.ok, error: result.ok ? null : result.error },
  });

  return NextResponse.json({ ok: true, delivered: result.ok });
}
