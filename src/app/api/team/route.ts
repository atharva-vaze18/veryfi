import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/env";
import { audit } from "@/lib/audit";

const canManageTeam = (s: { role: string; email: string }) => s.role === "owner" || s.role === "admin" || isSuperAdmin(s.email);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List everyone in the caller's org.
export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const users = await prisma.user.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true },
  });
  return NextResponse.json({ users, you: session.userId });
}

const Invite = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
  password: z.string().min(8, "Use at least 8 characters"),
});

// Create a sign-in for a teammate. Owners/admins only.
export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!canManageTeam(session)) {
    return NextResponse.json({ error: "Only owners and admins can add members." }, { status: 403 });
  }
  const parsed = Invite.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
  }
  const user = await prisma.user.create({
    data: {
      orgId: session.orgId,
      email,
      name: parsed.data.name,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true, lastLoginAt: true },
  });
  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "team.member_added",
    entityType: "User",
    entityId: user.id,
    payload: { email, role: user.role },
  });
  return NextResponse.json({ user }, { status: 201 });
}
