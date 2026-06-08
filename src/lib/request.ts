import { sha256Hex } from "./crypto";

// Extract the client IP from common proxy headers (works on Vercel/Render/Fly
// and behind nginx). Falls back to a placeholder for local dev.
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("fly-client-ip") ||
    "127.0.0.1"
  );
}

export function docHash(version: string, body: string, retention: string): string {
  return sha256Hex(`${version}|${body}|${retention}`);
}
