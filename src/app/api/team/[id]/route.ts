import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Remove a teammate's sign-in. Owners/admins only; cannot remove yourself or
// the org owner (transfer ownership first — out of scope for this build).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can remove members." }, { status: 403 });
  }
  if (params.id === session.userId) {
    return NextResponse.json({ error: "You can't remove your own account." }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target || target.orgId !== session.orgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (target.role === "owner") {
    return NextResponse.json({ error: "The org owner can't be removed." }, { status: 400 });
  }
  await prisma.user.delete({ where: { id: params.id } });
  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "team.member_removed",
    entityType: "User",
    entityId: params.id,
    payload: { email: target.email },
  });
  return NextResponse.json({ ok: true });
}
