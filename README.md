# Orbyt Verify

**Catch fake remote candidates before you hire them.**

A consent-based, 60-second check that detects deepfake injection, VPN/relay, impersonation, and non-present candidates — the remote-worker / "North Korean fake worker" fraud problem. You get **real fraud signals + a risk score**; your team makes the hiring decision.

> **This is identity-assurance & fraud detection — NOT a background check.** It collects no SSN, criminal, employment, or credit data and produces no "consumer report." That's what keeps it sellable **without** becoming a CRA. See [`docs/LEGAL_POSITIONING.md`](docs/LEGAL_POSITIONING.md) (and get a short attorney review before charging).

---

## What's real, today, for free

The app runs with **zero API keys**. These signals are genuinely measured (not mock) with no key at all:

- **Network round-trip latency** — flags a session relayed from far away ("claims US, physically distant").
- **Device timezone vs declared country** — catches a US applicant whose clock is on UTC+9.
- **Virtual-camera detection** — flags OBS / ManyCam / virtual cameras used to inject deepfaked video.
- **Browser automation / headless** — flags scripted sessions.
- **Live-presence (motion) check** — catches a static photo held to the camera.
- **Email reputation** — disposable-domain + live MX-record check.

A signal with no provider configured shows **"not evaluated"** — it is **never faked** and never affects the score.

## What turning on a key adds (all REAL)

| Key | Enables | Cost |
|---|---|---|
| `IPQS_API_KEY` | VPN / proxy / datacenter / Tor + IP fraud score + geo | **Free** ~5k/mo (IPQualityScore) |
| `STRIPE_SECRET_KEY` | 1:1 government-ID + selfie + liveness | ~$1.50/check (Stripe Identity) |
| `REALITY_DEFENDER_API_KEY` | **Deepfake-content scoring (LIVE)** — analyzes the captured selfie frame; a confirmed AI-generated face forces a High-risk verdict | Free ~50/mo |

Full setup: [`docs/API_SETUP.md`](docs/API_SETUP.md).

---

## Quickstart (zero infra)

```bash
cp .env.example .env        # works as-is; add keys later
npm install
npm run db:push             # creates the SQLite database
npm run db:seed             # starter recruiter account
npm run dev                 # http://localhost:3100
```

Sign in: **demo@orbyt.test** / **verify-demo-1234** (change before going live).

**Try it:** create a verification → open the candidate link (incognito) → consent → run the camera check. Your real signals are scored live. To see a high-risk result, open the candidate link with a VPN on, or in a headless/automation browser.

---

## How it works

1. Recruiter creates a verification → gets a private candidate link. No data collected yet.
2. Candidate opens the link, signs two consents (data + biometric), optionally does Stripe ID, then a ~10s camera check.
3. The browser measures real signals; the server adds IP intelligence + email reputation and computes a transparent risk score (`pass` / `review` / `risk`).
4. Recruiter sees the verdict + per-signal breakdown. Every action is in a hash-chained audit log.

## Stack

Single **Next.js 14** app (App Router) · **SQLite** via Prisma (zero infra; swap to Postgres for hosted scale — see [`docs/DEPLOY.md`](docs/DEPLOY.md)) · Tailwind. Deploys to Render / Railway / Fly.

## Docs
- [`docs/API_SETUP.md`](docs/API_SETUP.md) — every key, free tier, what it turns on
- [`docs/LEGAL_POSITIONING.md`](docs/LEGAL_POSITIONING.md) — why this isn't a CRA, and the consent you DO need
- [`docs/GO_TO_MARKET.md`](docs/GO_TO_MARKET.md) — who buys it, pricing, first customers
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — ship it to the web

> MVP. The scoring weights are sensible defaults — tune them on real cases. Have counsel review the consent language before commercial use.
