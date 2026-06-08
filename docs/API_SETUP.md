# API setup — turning on the real detections

The app works with **zero keys** (latency, timezone, virtual-camera, automation, liveness, email are all real without any key). Add these to `.env` to light up the rest. Each is real; none fakes a result.

## 1. IPQualityScore — VPN / proxy / datacenter / fraud score (recommended first)

The single highest-value add. Detects anonymizing networks and datacenter egress — the core remote-impersonation tell.

1. Sign up at <https://www.ipqualityscore.com/create-account> (free).
2. Free tier: **~5,000 lookups/month**.
3. Copy your API key → `.env`:
   ```
   IPQS_API_KEY="your_key"
   ```
4. Restart. The "VPN/proxy/Tor", "Datacenter IP", "IP fraud score", and "Declared vs IP country" signals go live.

## 2. Stripe Identity — 1:1 ID + selfie + liveness (when you want hard ID proofing)

1. Create a Stripe account → <https://dashboard.stripe.com>. Test keys are free.
2. Enable Identity (Dashboard → Identity).
3. Copy the secret key → `.env`:
   ```
   STRIPE_SECRET_KEY="sk_test_..."   # use sk_live_... in production
   ```
4. Cost: **~$1.50 per completed verification**, pay-as-you-go (no minimums).
5. Restart. The candidate flow now includes a real hosted ID + selfie step, and the "Government ID + selfie match" signal becomes live.

> Optional: set `STRIPE_WEBHOOK_SECRET` and point a Stripe webhook at `/api/webhooks/stripe` for async result updates. The app also fetches the result on submit, so the webhook is not required for the MVP.

## 3. Reality Defender — deepfake-content scoring (later)

The one enterprise-grade piece. The product is valuable without it.

1. Request access at <https://www.realitydefender.com> (free tier ~50 scans/mo).
2. Add the key → `.env`:
   ```
   REALITY_DEFENDER_API_KEY="your_key"
   ```
3. The adapter (`src/adapters/deepfake.ts`) has a clearly marked `TODO` where you wire their upload+poll API. Until wired it reports "not evaluated" — it won't silently fake anything.

## Required base config

```
JWT_SECRET="<openssl rand -hex 32>"   # session signing — REQUIRED in production
APP_URL="https://verify.yourdomain.com"   # used to build candidate links
DATABASE_URL="file:./dev.db"          # SQLite for dev; Postgres for prod (see DEPLOY.md)
```

## How to confirm what's live

Hit `GET /api/health` — it reports which detectors are active vs not configured.
