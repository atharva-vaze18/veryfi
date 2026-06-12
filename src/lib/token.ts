import { randomBytes } from "node:crypto";

// Candidate links are bearer capabilities: the token IS the access. So it must be
// unguessable (crypto-random, 256 bits), short-lived, and revocable.

export const CANDIDATE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function newCandidateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function defaultLinkExpiry(from = new Date()): Date {
  return new Date(from.getTime() + CANDIDATE_LINK_TTL_MS);
}

export type LinkState = "active" | "expired" | "revoked";

// Pre-Phase-1 rows have expiresAt = null; treat those as non-expiring rather than
// locking out candidates who already received a link.
export function linkState(v: { expiresAt: Date | null; revokedAt: Date | null }, now = new Date()): LinkState {
  if (v.revokedAt) return "revoked";
  if (v.expiresAt && now > v.expiresAt) return "expired";
  return "active";
}

// Uniform candidate-facing rejection for a dead link (don't reveal which).
export function linkDeadMessage(state: Exclude<LinkState, "active">): string {
  return state === "revoked"
    ? "This verification link has been revoked. Please ask the hiring team for a new link."
    : "This verification link has expired. Please ask the hiring team for a new link.";
}
