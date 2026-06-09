import { createHash } from "node:crypto";
import { prisma } from "./db";

// Hashes the key with SHA-256 (fast — API keys aren't passwords; they're long
// random strings so brute-forcing the hash is not feasible).
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface ResolvedOrg {
  orgId: string;
  keyId: string;
}

// Reads Authorization: Bearer <key>, verifies against stored hash, returns orgId.
export async function resolveApiKey(req: Request): Promise<ResolvedOrg> {
  const auth = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(vfy_live_\S+)$/i.exec(auth);
  if (!match) throw new ApiKeyError("Missing or malformed Authorization header. Expected: Bearer vfy_live_...");

  const key = match[1]!;
  const hash = hashApiKey(key);
  const record = await prisma.apiKey.findUnique({ where: { keyHash: hash } });
  if (!record || !record.enabled) throw new ApiKeyError("Invalid or revoked API key.");

  await prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  return { orgId: record.orgId, keyId: record.id };
}

export class ApiKeyError extends Error {}
