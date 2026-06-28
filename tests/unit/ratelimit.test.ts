import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/ratelimit";

describe("rateLimit (sliding window, in-memory fallback)", () => {
  it("allows up to the limit then blocks with a retry-after", async () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 5; i++) expect((await rateLimit(key, 5, 60_000)).ok).toBe(true);
    const blocked = await rateLimit(key, 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("keys are independent", async () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect((await rateLimit(a, 1, 60_000)).ok).toBe(true);
    expect((await rateLimit(a, 1, 60_000)).ok).toBe(false);
    expect((await rateLimit(b, 1, 60_000)).ok).toBe(true);
  });
});
