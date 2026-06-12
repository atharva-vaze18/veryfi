# Veryfi — Customer-Readiness Audit

Audited: 2026-06-11 · Commit: `363184d` · Auditor: Claude Code

**Architecture note that reframes several requirements:** Veryfi is *not* a Supabase-client
app. The browser never talks to Supabase directly — there is no `NEXT_PUBLIC_SUPABASE_*`
usage anywhere in `src/` (verified by grep). All data access goes through Next.js API
routes using Prisma over a server-side Postgres connection, with a custom JWT session
(httpOnly cookie, `src/lib/auth.ts`). Tenant isolation is therefore enforced in the API
layer, and RLS is **defense-in-depth** against the Supabase PostgREST surface (which
exists for every Supabase project), not the primary boundary. RLS is still required —
see #4 — because Supabase grants `anon`/`authenticated` access to new tables in `public`
by default.

Legend: ✅ PASS · 🟡 PARTIAL · ❌ FAIL · ➖ N/A

---

## P0 product requirements (1–40)

### 1. Complete recruiter authentication — 🟡 PARTIAL
- **Files:** `src/lib/auth.ts`, `src/app/api/auth/{signup,login,logout,me,forgot,reset}/route.ts`
- **Existing:** Signup, login (rate-limited 10/5min/IP+email), logout, `me`, password
  reset via hashed single-use 1h token over Resend, bcrypt(10), 7-day JWT httpOnly cookie,
  protected routes return 401 and `AppShell` redirects.
- **Missing:** Email verification at signup; server-side session revocation (JWT valid
  until expiry); Resend sender is `onboarding@resend.dev` (unverified domain ⇒ reset
  emails only deliver to the Resend account owner).
- **Risk:** Sign-up with someone else's email; stolen JWT valid up to 7 days.
- **Proposed:** Verify a domain in Resend, then add `emailVerifiedAt` + token flow
  (deliberately deferred: enforcing verification today with the unverified sender would
  lock out every real customer). Add `tokenVersion` to User for revocation.
- **Test:** auth e2e (signup→login→logout→reset).

### 2. Organization/workspace model — ✅ PASS
- **Files:** `prisma/schema.prisma` (Org, User.orgId, Verification.orgId, ApiKey.orgId,
  WebhookEndpoint.orgId, Integration.orgId, ScoringProfile.orgId, AuditEvent.orgId)
- Every tenant object carries `orgId`; signup creates org + owner atomically.

### 3. Strict tenant isolation — ✅ PASS (app layer)
- **Files:** every route under `src/app/api/` was swept. All session routes filter by
  `session.orgId` (e.g. `verifications/route.ts:24`, `verifications/[id]/route.ts:30`,
  `frames/route.ts:16`, `review/route.ts:20`, `keys/[id]/route.ts:15`,
  `webhooks/[id]/route.ts:15`, `team/[id]/route.ts:22`); v1 API resolves org from the
  hashed Bearer key (`v1/verifications/[id]/route.ts:16`). Cross-org ID probing returns
  404/403 with no data.
- **Missing:** automated cross-org tests (see #49).

### 4. RLS on every exposed table — ❌ FAIL → **fixed in this audit (Phase 4)**
- **Existing:** Tables created by `prisma db push` in `public` with RLS disabled.
  Supabase's default privileges grant `anon`/`authenticated` access to new tables in
  `public` via PostgREST — anyone holding the project's anon key could read/write rows.
  The anon key is not in any client bundle, but it must be assumed discoverable.
- **Proposed/Applied:** Enable RLS on all 10 tables with **no policies** (deny-all for
  PostgREST roles) and revoke `anon`/`authenticated` privileges. The app is unaffected:
  Prisma connects as the table **owner** (`postgres`), which bypasses non-FORCE RLS.
- **Test:** `supabase/tests/rls_deny_all.sql` + verification query in this session.

### 5. Recruiter roles — 🟡 PARTIAL
- **Existing:** `owner | admin | member` enforced for team management
  (`team/route.ts:8`), member password reset, removal protections (can't remove owner,
  self, or superadmin). Billing checkout requires session.
- **Missing:** `viewer` role; role checks on billing change and verification deletion
  (any member can delete a verification today).
- **Proposed:** add `viewer`; gate DELETE /verifications and billing on owner/admin. (P1)

### 6. New verification form — ✅ PASS
- `verify/new/page.tsx` + zod server validation `verifications/route.ts:13-18`
  (name min 1, email format, country ≤2 chars, role ≤200).

### 7. Secure candidate-link generation — 🟡 PARTIAL → **fixed (Phase 1)**
- **Existing:** token is Prisma `cuid()` (`schema.prisma:63`) — unique and non-sequential
  but **not cryptographically random** (timestamp+counter+fingerprint structure).
- **Applied:** 32-byte `crypto.randomBytes` base64url token at creation. Stored plaintext
  (acceptable: single-verification scope, expiring, revocable; hashing would break the
  recruiter "copy link" UX — documented trade-off).

### 8. Link expiration and revocation — ❌ FAIL → **fixed (Phase 1)**
- **Existing:** none. A leaked link worked forever until submitted.
- **Applied:** `expiresAt` (default 7 days) + `revokedAt` on Verification; all four
  candidate routes reject expired/revoked links; recruiter endpoint
  `POST /api/verifications/[id]/link` revokes + regenerates; detail page shows expiry
  and revoke/regenerate buttons.
- **Test:** unit `linkState()`; manual e2e.

### 9. One-verification state machine — 🟡 PARTIAL
- **Existing:** `pending → consented → complete` enforced in code; `expired`/`revoked`
  now derived from `expiresAt`/`revokedAt` (Phase 1) rather than stored states.
  `opened`/`in_progress` not tracked.
- **Risk:** low — no state can be skipped (consent gate at `submit/route.ts:42-45`).
- **Proposed:** add `openedAt` timestamp (P1).

### 10. Idempotent candidate submission — 🟡 PARTIAL → **fixed (Phase 2)**
- **Existing:** `submit/route.ts:40` returns 409 when already complete, but check-then-write
  left a race window: two concurrent submits could both pass the check and write twice.
- **Applied:** atomic claim — `updateMany({ where: { id, status: { not "complete" } … }})`
  transition to `processing` before scoring; the loser of the race gets 409. Usage
  metering counts created verifications, so double-submit never double-charged.

### 11. Separate consent gates — ✅ PASS
- Distinct `DATA_PROCESSING` + `BIOMETRIC` records with version, document hash,
  typed name, IP, UA, retention text, timestamp (`consent/route.ts:29-40`,
  `lib/consent.ts`). Version mismatch rejected (409).

### 12. No capture before consent — ✅ PASS
- Candidate page renders `ConsentStep` until both consents signed
  (`v/[token]/page.tsx:48-50`); `getUserMedia` only inside `VerifyStep`. Server enforces
  too: IDV requires BIOMETRIC consent (`idv/route.ts:33-34`), submit requires both
  (`submit/route.ts:42-45`).

### 13. Candidate explanation page — ✅ PASS
- Consent docs state what is checked, what is stored, why, retention
  (90-day signals / `BIOMETRIC_RETENTION_DAYS` for vendor biometrics), and that
  on-device video never leaves the browser (`lib/consent.ts:13-31`).
- **Missing:** explicit deletion-request contact (P1 copy change).

### 14. Camera permission workflow — 🟡 PARTIAL
- **Existing:** `getUserMedia` failures surface an error with retry; insecure context
  yields a clear failure; "camera in use" treated generically.
- **Missing:** distinct messaging per `NotAllowedError`/`NotFoundError`/`NotReadableError`;
  unsupported-browser instructions.
- **Proposed:** map error.name → guidance copy (P1). Failure is never scored as clean —
  liveness reports "not evaluated" (risk-neutral) and IDV gate still applies.

### 15. Browser compatibility handling — 🟡 PARTIAL
- MediaPipe WASM + getUserMedia paths degrade to "not evaluated", never to a low-risk
  pass. No browser matrix has been executed. **Proposed:** manual matrix before pilot.

### 16. Live-stream validation — 🟡 PARTIAL
- `lib/liveness.ts` validates face presence per frame across the challenge window and
  motion variance; `score.ts` liveness-motion signal detects static images.
  Track `muted`/`ended`/dimension checks not explicit. (P1)

### 17. Randomized liveness challenge — ✅ PASS
- `liveness.ts:33-50` — Fisher-Yates shuffle picks 2 random challenges per run.

### 18. Liveness failure states — ✅ PASS
- Distinguished: `no live face`, `multiple faces`, `failed n/m`, anomaly flags, and
  "not evaluated (model unavailable / camera not granted)" (`score.ts` challenge block).

### 19. Virtual-camera heuristic — ✅ PASS
- Label heuristic computed server-side from enumerated labels
  (`detectVirtualCameras`), presented as a weighted **signal** (+22) with reason text —
  never as proof; combined with liveness/motion evidence. Copy says "can inject", not
  "is fraud".

### 20. Browser-automation signals — ✅ PASS
- `webdriver` flag (+15, weighted not auto-reject); behavioral collector adds
  focus/blur, paste, timing anomalies as warn-level evidence (`score.ts` behavioral block).

### 21. Server-derived IP — ✅ PASS
- `lib/request.ts:5-14` reads `x-forwarded-for` set by Vercel's edge; nothing accepts a
  client-supplied IP. (Self-hosting behind no proxy would need hardening — documented.)

### 22. VPN/proxy/Tor/datacenter lookup — ✅ PASS
- Server-side proxycheck.io → IPQS fallback with 7s timeouts (`adapters/ipintel.ts`);
  provider failure ⇒ `vpnEvaluated:false` ⇒ "not evaluated" signal worth 0 points —
  an outage can never look like a clean IP.

### 23. Country mismatch check — ✅ PASS
- Declared vs IP country (+15) and declared vs device timezone (+10) with all values
  shown in the evidence row (`score.ts` geo/timezone blocks).

### 24. Email reputation check — ✅ PASS
- Syntax, MX lookup, disposable-domain list (`adapters/emailrisk.ts`);
  `evaluated:false` on failure ⇒ unknown, not verified.

### 25. Deterministic scoring engine — ✅ PASS (tests added in Phase 5)
- `computeVerdict`/`summarizeSignals` are pure functions of inputs + weights
  (`lib/score.ts`); per-org `ScoringProfile` weights resolved explicitly.
- **Applied:** vitest unit tests covering thresholds, hard-fail overrides, unknown
  handling, name matching. **Tests exposed and fixed a real weakness:** trust
  credits (verified ID −25, clean liveness −15, name match −10 ≈ −50) could fully
  mask a VPN + datacenter + disposable-email stack (+45) and yield a clean 0.
  `summarizeSignals` now caps aggregate trust credit at −12 and floors any verdict
  with an evaluated risk-severity signal at **Review** (route-to-human, never
  auto-reject).

### 26. Versioned scoring — ❌ FAIL → **fixed (Phase 2)**
- **Applied:** `SCORE_VERSION` constant in `score.ts`, persisted as
  `Verification.scoreVersion`; signal inputs already persisted (`signalsJson`),
  weights resolvable from the versioned defaults + org profile.

### 27. Three-way verdict — ✅ PASS
- `pass | review | risk` → "Likely a real, present candidate" / "Review recommended" /
  "High fraud risk". No accusatory labels anywhere in UI or webhooks.

### 28. Unknown-data handling — ✅ PASS
- Every unavailable provider yields an `info` severity, 0-point, `evaluated:false`
  signal labeled "not evaluated"; confidence % reflects evaluated-signal coverage.
  Unknowns never reduce score.

### 29. Human-readable evidence — ✅ PASS
- Each signal: label, observed value, points contribution, severity, detail sentence;
  rendered on `verify/[id]` and returned by the v1 API.

### 30. No automated rejection — ✅ PASS
- Product emits verdicts + evidence; `reviewDecision` is an explicit human action
  (`review/route.ts`). No auto-reject path exists. Candidate receipt says
  "the hiring team will follow up."

### 31. Recruiter dashboard — 🟡 PARTIAL
- List with stats, status, band; polling refresh. **Missing:** filters by
  verdict/date/recruiter, pagination beyond `take:200`. (P1)

### 32. Verification-detail page — ✅ PASS
- `verify/[id]` shows consents+versions, timestamps, signals, score, IDV status,
  review decision/notes, candidate link.

### 33. Reliable result update — ✅ PASS
- Dashboard and detail poll; pending deepfake finalized lazily on poll
  (`lib/deepfake-finalize.ts`).

### 34. Candidate completion screen — 🟡 PARTIAL → **fixed (Phase 2)**
- **Existing:** `Done` screen is a clean receipt, but `submit` returned
  `band/riskScore/label` to the candidate's browser (iterable oracle for a fraudster),
  and the Done screen linked to the recruiter result URL.
- **Applied:** submit returns `{ ok, status: "complete" }` only; recruiter link removed.

### 35. Transactional email delivery — 🟡 PARTIAL
- Resend wired for password reset. **Missing:** "email link to candidate" send + retry
  log; blocked on Resend domain verification (sender currently only delivers to the
  account owner). (P1, after domain verify)

### 36. Immutable audit events — ✅ PASS
- Append-only, hash-chained `AuditEvent` (`lib/audit.ts`); events for create, consent,
  IDV start, completion, deletion, team changes, billing sync, review decisions.
- **Missing:** result-viewed events. (P1)

### 37. Minimal data storage — ✅ PASS
- No raw video ever; on-device liveness never uploads; deepfake frame is temp-file,
  deleted post-upload (`submit/route.ts:53,64`); session frames stored **only** for
  review-band results, capped at 10, behind service-role storage. Stores results, not
  biometrics.

### 38. Deletion workflow — 🟡 PARTIAL → **storage cleanup fixed (Phase 3)**
- **Existing:** DELETE cascades consents; **storage frames were orphaned**.
- **Applied:** delete route now removes `session-frames` objects first.
- **Missing:** role-gating of delete (see #5); vendor-side (Didit) deletion API call. (P1)

### 39. Error recovery — 🟡 PARTIAL
- Candidate can retry the camera check and IDV without a new link; submit failure
  before completion leaves status retry-able; no duplicate billing (metering counts
  creations). Refresh mid-flow resumes at the right step (consents persisted).

### 40. Production monitoring — ❌ FAIL
- Only Vercel function logs. **Proposed:** Sentry (server + client) with PII scrubbing;
  alert on provider failure rate. (P1 — required before paid pilot.)

---

## P0 security & abuse (41–52)

### 41. Rate-limit verification creation — ❌ FAIL → **fixed (Phase 3)**
- **Applied:** 30/hour per user on `POST /api/verifications` (plus existing monthly
  quota wall at `verifications/route.ts:70-76`).

### 42. Rate-limit candidate attempts — ❌ FAIL → **fixed (Phase 3)**
- **Applied:** per-token+IP limits on candidate GET/consent/IDV/submit (20/5min)
  allowing legitimate retries while blunting brute force.

### 43. Protect costly integrations — ✅ PASS
- IDV session creation requires a valid token + BIOMETRIC consent (`idv/route.ts:26-34`);
  deepfake upload requires a valid un-submitted token; Stripe checkout requires an
  authenticated session. Expiry/revocation (Phase 1) closes the stale-token hole.

### 44. Webhook signature verification — ✅ PASS
- Stripe: `constructEvent` on the raw body (`stripe/webhook/route.ts:23`).
  Greenhouse: HMAC check per integration (`integrations/greenhouse/webhook/route.ts`).
  Outbound webhooks signed `x-veryfi-signature` HMAC-SHA256 (`lib/webhook.ts:90`).

### 45. Webhook replay/idempotency — 🟡 PARTIAL
- Stripe handler is **state-sync** (writes subscription state, no increments), so
  replays converge rather than duplicate. No event-ID dedupe table.
- **Proposed:** `processed_stripe_events` table before live billing. (P1; billing is
  feature-flagged off until Stripe keys are set.)

### 46. Input validation — ✅ PASS
- zod on every mutating route (verifications, consent, team, keys, webhooks
  with `z.string().url()`, scoring profile, review, IDV).

### 47. No service secrets in frontend — ✅ PASS
- Zero `NEXT_PUBLIC_*` references in `src/`; all keys read in server-only modules;
  `.env` gitignored. Verified via grep + build output review.

### 48. Secure headers — ❌ FAIL → **fixed (Phase 3)**
- **Applied:** CSP, HSTS, `X-Frame-Options: DENY` (candidate flow excepted for IDV
  iframe needs), `X-Content-Type-Options`, `Referrer-Policy`, and Permissions-Policy
  granting camera only to self.

### 49. Object-level authorization tests — 🟡 PARTIAL
- Manual sweep done (#3); unit tests added for pure logic; **automated cross-org HTTP
  tests still needed** (requires test DB harness — P1, scaffold listed below).

### 50. Abuse-cost tests — 🟡 PARTIAL
- Quota wall + new rate limits cap spend; limits are in-memory per-instance
  (`lib/ratelimit.ts:1-4`) — a determined distributed attacker needs the Redis-backed
  version. (P1: Upstash.)

### 51. MFA for owners/admins — ❌ FAIL
- Not implemented. (P1 — TOTP; required before enterprise, acceptable for first pilots.)

### 52. ASVS baseline — 🟡 PARTIAL
- This document is the control inventory; full ASVS mapping not done. (P1)

---

## P0 payments (53–60)

### 53. Stripe Checkout — 🟡 PARTIAL (feature-flagged off)
- Checkout + Customer Portal + webhook sync fully implemented
  (`billing/checkout`, `billing/portal`, `stripe/webhook`) but **dormant**: no Stripe
  keys/prices configured (`features.stripeBilling=false`). Buying requires setting 4 env
  vars — no code.

### 54. Pilot credits — ✅ PASS (as monthly quota)
- Plans grant 25/300/2000 verifications/month (`lib/plans.ts`); enforced at creation.

### 55. Usage ledger — 🟡 PARTIAL
- Usage = count of Verification rows in the calendar month (`billing.ts:31-47`) —
  immutable in effect (deleting a verification frees quota, though; flagged).
  **Proposed:** dedicated append-only `UsageEvent` on completion. (P1)

### 56. Usage visibility — ✅ PASS
- AppShell shows `plan · used/quota` chip; billing page shows usage, quota, plan,
  reset-on-month boundary.

### 57. Webhook-driven payment state — ✅ PASS (when enabled)
- Plan/quota only change inside the signature-verified webhook
  (`stripe/webhook/route.ts:36-45`); the success redirect grants nothing.

### 58. Test/live separation — ➖ N/A until keys exist
- Single env var set per deployment; use separate Vercel envs for test/live.

### 59. No negative/duplicate balances — ✅ PASS
- Quota check at creation; count-based usage can't go negative; Phase 2 atomic submit
  prevents duplicate completion records.

### 60. Manual design-partner override — 🟡 PARTIAL
- Superadmin (`SUPERADMIN_EMAILS`) is unlimited and can adjust orgs via DB;
  no in-app "grant credits with reason" UI. (P1)

---

## Verdict

**Before this audit:** not customer-ready — candidate links never expired and weren't
revocable, scores weren't versioned, no rate limits on costly endpoints, no security
headers, RLS off, and the submit endpoint leaked the score to candidates.

**After P0 fixes (this session):** ready for **monitored design-partner pilots** —
with these human-action items still open:
1. **Resend domain verification** (password reset + candidate emails for real users).
2. **Sentry (or similar) monitoring** before charging anyone.
3. **Counsel review of consent texts** before real candidates (noted in
   `lib/consent.ts:11-12`).
4. **Stripe keys + prices** when ready to charge (code is live, flag is off).
5. Browser matrix run (Chrome/Edge/Safari/Firefox) on the candidate flow.
6. Distributed rate limiting (Upstash) before any scale.

## Test scaffold still to build (P1)
```
tests/e2e/            (Playwright: auth, isolation, candidate flow, camera errors)
tests/integration/    (provider mocks: proxy, email-rep, stripe webhook replay)
supabase/tests/       (rls_deny_all.sql — written in Phase 4)
```
Unit tests (vitest) for the scoring engine, thresholds, name matching, link state and
rate limiter were added in Phase 5 of this session — see `tests/unit/`.
