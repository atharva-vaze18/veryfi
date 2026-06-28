import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword, signSession, setSessionCookie } from "@/lib/auth";
import { planFor } from "@/lib/plans";
import { audit } from "@/lib/audit";
import { sendEmailVerification } from "@/lib/email";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  orgName: z.string().min(1, "Company name required").max(120),
  name: z.string().min(1, "Your name required").max(120),
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { orgName, name, email, password } = parsed.data;
  const lowerEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: lowerEmail } });
  if (existing) return NextResponse.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });

  const free = planFor("free");
  // New org starts on the free plan; first user is the owner.
  const org = await prisma.org.create({
    data: { name: orgName, plan: free.id, monthlyQuota: free.monthlyQuota },
  });
  // 24-hour single-use email-verification token. Stored plaintext (limited
  // blast radius: one token per user, single-use, time-boxed, useless without
  // an active account on the same email).
  const verifyToken = crypto.randomBytes(32).toString("base64url");
  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email: lowerEmail,
      name,
      role: "owner",
      passwordHash: await hashPassword(password),
      lastLoginAt: new Date(),
      emailVerifyToken: verifyToken,
      emailVerifyTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });

  await audit({
    orgId: org.id,
    actor: user.id,
    action: "org.created",
    entityType: "Org",
    entityId: org.id,
    payload: { orgName, ownerEmail: lowerEmail },
  });

  // Fire-and-forget verification email. Failure is audited but never blocks
  // the response — user can request a resend from the dashboard banner.
  const verifyUrl = `${env.APP_URL}/api/auth/verify-email?token=${verifyToken}`;
  sendEmailVerification(lowerEmail, verifyUrl)
    .then((r) => {
      if (!r.ok) console.error("email_verification_send_failed", r.error);
      return audit({
        orgId: org.id,
        actor: user.id,
        action: "auth.verification_email_sent",
        entityType: "User",
        entityId: user.id,
        payload: { delivered: r.ok, error: r.ok ? null : r.error },
      });
    })
    .catch((e) => console.error("email_verification_audit_failed", (e as Error).message));

  const session = {
    userId: user.id,
    orgId: org.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: false,
  };
  setSessionCookie(signSession(session));
  return NextResponse.json({ user: { ...session, orgName: org.name } }, { status: 201 });
}
