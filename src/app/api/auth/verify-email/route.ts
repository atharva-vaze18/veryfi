import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signSession, setSessionCookie, getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single-use email-verification consumer. Clicking the link sets emailVerifiedAt
// and (if the user already has a session) re-issues the cookie so the JWT
// claim flips to verified without needing a fresh login.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (token.length < 16) {
    return NextResponse.redirect(`${env.APP_URL}/?verifyError=invalid`);
  }
  const user = await prisma.user.findUnique({ where: { emailVerifyToken: token }, include: { org: true } });
  if (!user || !user.emailVerifyTokenExpiresAt || user.emailVerifyTokenExpiresAt < new Date()) {
    return NextResponse.redirect(`${env.APP_URL}/?verifyError=expired`);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), emailVerifyToken: null, emailVerifyTokenExpiresAt: null },
  });
  await audit({
    orgId: user.orgId,
    actor: user.id,
    action: "auth.email_verified",
    entityType: "User",
    entityId: user.id,
  });

  // If the same browser already holds a session for this user, refresh the JWT
  // so the emailVerified claim flips immediately. Otherwise, the existing
  // session JWT (carrying emailVerified=false) keeps blocking authenticated
  // routes until the user signs in again — which is acceptable.
  const current = getSession();
  if (current && current.userId === user.id) {
    setSessionCookie(
      signSession({
        userId: user.id,
        orgId: user.orgId,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: true,
      }),
    );
  }
  return NextResponse.redirect(`${env.APP_URL}/dashboard?verified=true`);
}
