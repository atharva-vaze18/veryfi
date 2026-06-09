import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/env";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner/admin (or super-admin) resets a teammate's password to a fresh random one,
// returned once so it can be shared securely. Works without email configured.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (session.role !== "owner" && session.role !== "admin" && !isSuperAdmin(session.email)) {
    return NextResponse.json({ error: "Only owners and admins can reset passwords." }, { status: 403 });
  }
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target || target.orgId !== session.orgId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Readable random password: ~58 bits, no ambiguous chars.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const password = Array.from(crypto.randomBytes(12)).map((b) => alphabet[b % alphabet.length]).join("");
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(password), resetTokenHash: null, resetExpiresAt: null },
  });
  await audit({ orgId: session.orgId, actor: session.userId, action: "team.password_reset", entityType: "User", entityId: target.id, payload: { email: target.email } });
  return NextResponse.json({ email: target.email, password });
}
