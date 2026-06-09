import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hashApiKey } from "@/lib/apikey";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Create = z.object({ name: z.string().min(1).max(64) });

export async function GET() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { orgId: session.orgId },
    orderBy: { createdAt: "desc" },
    select: { id: true, keyPrefix: true, name: true, createdAt: true, lastUsedAt: true, enabled: true },
  });

  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const rawKey = `vfy_live_${randomBytes(28).toString("base64url")}`;
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12); // "vfy_live_XXX"

  const record = await prisma.apiKey.create({
    data: {
      orgId: session.orgId,
      keyHash,
      keyPrefix,
      name: parsed.data.name,
    },
  });

  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "apikey.created",
    entityType: "ApiKey",
    entityId: record.id,
    payload: { name: parsed.data.name },
  });

  // Return the raw key ONCE — never stored in plaintext.
  return NextResponse.json({ id: record.id, key: rawKey, keyPrefix, name: record.name }, { status: 201 });
}
