import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "./env";

const COOKIE = "orbyt_verify_session";
// Short-lived cookie issued during login for users with MFA enabled. Holds only
// the userId; cleared on successful TOTP challenge or 10-min expiry.
const MFA_PENDING_COOKIE = "veryfi_mfa_pending";

export interface Session {
  userId: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
  // Whether the user has confirmed their email at signup. Carried in the JWT
  // (re-issued on /api/auth/verify-email) so authenticated routes can gate on
  // it without a per-request DB lookup.
  emailVerified: boolean;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export function signSession(s: Session): string {
  return jwt.sign(s, env.JWT_SECRET, { expiresIn: "7d" });
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

// Read + verify the session from the request cookie. Returns null if absent/invalid.
export function getSession(): Session | null {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const raw = jwt.verify(token, env.JWT_SECRET) as Partial<Session>;
    return {
      userId: raw.userId!,
      orgId: raw.orgId!,
      email: raw.email!,
      name: raw.name!,
      role: raw.role!,
      // Sessions issued before email-verification existed will lack this claim;
      // treat as verified so existing users aren't suddenly locked out. New
      // signups always set the claim explicitly.
      emailVerified: raw.emailVerified ?? true,
    };
  } catch {
    return null;
  }
}

// Returns a 403 NextResponse when the session is present but the user hasn't
// confirmed their email yet. Use this on every authenticated mutating route
// EXCEPT /api/auth/verify-email, /api/auth/resend-verification, /api/auth/me,
// /api/auth/logout. Returns null when the user is verified (i.e. proceed).
export function requireEmailVerified(session: Session): NextResponse | null {
  if (session.emailVerified) return null;
  return NextResponse.json({ error: "email_not_verified" }, { status: 403 });
}

// MFA-pending cookie helpers. The cookie carries a JWT with only { userId }
// and a 10-min TTL — issued at login when mfaEnabled, exchanged for a real
// session by /api/auth/mfa/challenge.
export function signMfaPending(userId: string): string {
  return jwt.sign({ userId, kind: "mfa_pending" }, env.JWT_SECRET, { expiresIn: "10m" });
}

export function setMfaPendingCookie(token: string) {
  cookies().set(MFA_PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
}

export function clearMfaPendingCookie() {
  cookies().delete(MFA_PENDING_COOKIE);
}

export function getMfaPendingUserId(): string | null {
  const token = cookies().get(MFA_PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const raw = jwt.verify(token, env.JWT_SECRET) as { userId?: string; kind?: string };
    return raw.kind === "mfa_pending" && typeof raw.userId === "string" ? raw.userId : null;
  } catch {
    return null;
  }
}
