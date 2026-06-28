import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { sha256Hex } from "@/lib/crypto";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/ratelimit";
import { sendPasswordReset } from "@/lib/email";
import { audit } from "@/lib/audit";
import { env, features } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ email: z.string().email() });

// Request a password reset. Always returns the same response whether or not the
// account exists (no user enumeration). When email is configured, a one-hour,
// single-use, hashed token link is emailed.
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit(`forgot:${ip}`, 5, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: sha256Hex(token), resetExpiresAt: new Date(Date.now() + 60 * 60_000) },
    });
    const link = `${env.APP_URL}/reset?token=${token}`;
    const result = await sendPasswordReset(email, link);
    if (!result.ok) console.error("password_reset_email_failed", result.error);
    await audit({
      orgId: user.orgId,
      actor: user.id,
      action: "auth.password_reset_requested",
      entityType: "User",
      entityId: user.id,
      payload: { delivered: result.ok, error: result.ok ? null : result.error },
    });
  }
  // Generic response — never reveals whether the email exists.
  return NextResponse.json({ ok: true, emailConfigured: features.email });
}
