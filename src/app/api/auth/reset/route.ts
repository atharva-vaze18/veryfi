import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { sha256Hex } from "@/lib/crypto";
import { getClientIp } from "@/lib/request";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().min(16), password: z.string().min(8, "Use at least 8 characters") });

// Complete a password reset with the emailed token. Token is hashed in the DB,
// single-use, and expires after 1 hour.
export async function POST(req: Request) {
  const rl = rateLimit(`reset:${getClientIp(req)}`, 10, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const tokenHash = sha256Hex(parsed.data.token);
  const user = await prisma.user.findFirst({ where: { resetTokenHash: tokenHash } });
  if (!user || !user.resetExpiresAt || user.resetExpiresAt < new Date()) {
    return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.password), resetTokenHash: null, resetExpiresAt: null },
  });
  return NextResponse.json({ ok: true });
}
