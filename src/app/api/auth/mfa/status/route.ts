import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { mfaEnabled: true } });
  return NextResponse.json({ enabled: !!user?.mfaEnabled });
}
