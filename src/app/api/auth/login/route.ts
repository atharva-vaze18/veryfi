import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, signSession, setSessionCookie } from "@/lib/auth";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  // Throttle brute force: max 10 attempts per IP+email per 5 minutes.
  const ip = getClientIp(req);
  const rl = rateLimit(`login:${ip}:${parsed.data.email.toLowerCase()}`, 10, 5 * 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, include: { org: true } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const session = { userId: user.id, orgId: user.orgId, email: user.email, name: user.name, role: user.role };
  setSessionCookie(signSession(session));
  return NextResponse.json({ user: { ...session, orgName: user.org.name } });
}
