import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  const org = await prisma.org.findUnique({ where: { id: session.orgId } });
  return NextResponse.json({ user: { ...session, orgName: org?.name } });
}
