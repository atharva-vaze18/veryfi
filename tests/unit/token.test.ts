import { describe, it, expect } from "vitest";
import { newCandidateToken, defaultLinkExpiry, linkState, CANDIDATE_LINK_TTL_MS } from "@/lib/token";

describe("candidate link tokens", () => {
  it("are crypto-random, 256-bit, URL-safe, and unique", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const t = newCandidateToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
      seen.add(t);
    }
    expect(seen.size).toBe(1000);
  });

  it("default expiry is 7 days out", () => {
    const from = new Date("2026-06-11T00:00:00Z");
    expect(defaultLinkExpiry(from).getTime() - from.getTime()).toBe(CANDIDATE_LINK_TTL_MS);
  });
});

describe("linkState", () => {
  const now = new Date("2026-06-11T12:00:00Z");
  const past = new Date("2026-06-10T12:00:00Z");
  const future = new Date("2026-06-12T12:00:00Z");

  it("active when unexpired and unrevoked", () => {
    expect(linkState({ expiresAt: future, revokedAt: null }, now)).toBe("active");
  });
  it("expired when past expiresAt", () => {
    expect(linkState({ expiresAt: past, revokedAt: null }, now)).toBe("expired");
  });
  it("revoked wins over everything", () => {
    expect(linkState({ expiresAt: future, revokedAt: past }, now)).toBe("revoked");
    expect(linkState({ expiresAt: past, revokedAt: past }, now)).toBe("revoked");
  });
  it("legacy rows (no expiresAt) remain active rather than locking out candidates", () => {
    expect(linkState({ expiresAt: null, revokedAt: null }, now)).toBe("active");
  });
});
