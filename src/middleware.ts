import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Gates every authenticated /api route on emailVerified=true. The session
// cookie's JWT carries the claim (signup mints it as false, login refreshes
// it from the DB, /api/auth/verify-email re-issues it as true). When the
// claim is false, return 403 { error: "email_not_verified" } centrally so
// individual routes don't each have to remember the gate.

const ALLOWLIST = new Set<string>([
  "/api/auth/verify-email",
  "/api/auth/resend-verification",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/forgot",
  "/api/auth/reset",
  "/api/auth/mfa/challenge",
  "/api/health",
  // Webhook ingestion + candidate token routes are stranger-callable; they
  // run their own auth (HMAC, candidate token). Not gated here.
  "/api/stripe/webhook",
  "/api/v1/verifications",
]);

function isAllowlisted(pathname: string): boolean {
  if (ALLOWLIST.has(pathname)) return true;
  if (pathname.startsWith("/api/candidate/")) return true;
  if (pathname.startsWith("/api/integrations/") && pathname.endsWith("/webhook")) return true;
  if (pathname.startsWith("/api/v1/")) return true;
  return false;
}

const COOKIE = "orbyt_verify_session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (isAllowlisted(pathname)) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.next(); // route handler will issue its own 401

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-only-change-me-please-set-a-real-secret-0000000000000000");
    const { payload } = await jwtVerify(token, secret);
    const emailVerified = payload.emailVerified;
    // Sessions minted before this feature shipped lack the claim — treat as
    // verified so we don't lock out existing users.
    if (emailVerified === false) {
      return NextResponse.json({ error: "email_not_verified" }, { status: 403 });
    }
  } catch {
    // Bad/expired token — let the route handler reject with its own 401.
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
