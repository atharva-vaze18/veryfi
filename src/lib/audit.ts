import { prisma } from "./db";
import { sha256Hex, canonical } from "./crypto";

// Append-only, hash-chained audit writer. No update/delete path exists.
export async function audit(input: {
  orgId?: string | null;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  payload?: unknown;
}) {
  const payloadJson = input.payload == null ? null : canonical(input.payload);
  const payloadHash = sha256Hex(
    canonical({ a: input.actor, ac: input.action, et: input.entityType, ei: input.entityId, p: input.payload ?? null }),
  );
  const prev = await prisma.auditEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { payloadHash: true } });
  await prisma.auditEvent.create({
    data: {
      orgId: input.orgId ?? null,
      actor: input.actor,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payloadHash,
      prevHash: prev?.payloadHash ?? null,
      payloadJson,
    },
  });
}
