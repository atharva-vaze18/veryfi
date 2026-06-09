# Deploy to Vercel + Supabase

The app is already converted to Postgres and Vercel-ready. This is ~10 minutes.
You do the account steps (I can't log into your accounts); the code is done.

---

## Step 1 — Supabase (your database)

1. Go to **supabase.com** → **New project**. Set a strong **database password** (save it), pick a region close to you.
2. Wait ~2 min for it to provision.
3. **Project Settings → Database → Connection string.** You need two URLs:
   - **Transaction pooler** (host `...pooler.supabase.com`, port **6543**) → this is your **`DATABASE_URL`**. Append `?pgbouncer=true` at the end.
   - **Direct / Session** connection (port **5432**) → this is your **`DIRECT_URL`**.
   Replace `[YOUR-PASSWORD]` in both with the password from step 1.

## Step 2 — Create the tables (from your machine, once)

Put both URLs in your local `.env`:
```bash
cd /Users/vazea/Desktop/orbyt-verify
# (edit .env: set DATABASE_URL and DIRECT_URL to the Supabase values)
npx prisma db push     # creates all tables in Supabase
```
There are **no demo accounts** — the app is self-serve. Real users sign up at the
landing page (`Create account`), which creates their company + owner login. They
can then add teammates under **Team**.

If you want to seed the very first admin yourself (optional), run once:
```bash
ADMIN_ORG="Your Co" ADMIN_EMAIL="you@yourco.com" ADMIN_PASSWORD="a-strong-pass" npm run db:seed
```
Now `npm run dev` also works locally against Supabase.

## Step 3 — Push the code to GitHub

```bash
cd /Users/vazea/Desktop/orbyt-verify
git init && git add -A && git commit -m "Orbyt Verify"
# create an empty repo on github.com, then:
git remote add origin https://github.com/YOU/orbyt-verify.git
git branch -M main && git push -u origin main
```
(`.env` is gitignored — your keys won't be pushed. Good.)

## Step 4 — Vercel (hosting)

1. **vercel.com → New Project → Import** your GitHub repo. It auto-detects Next.js.
2. **Environment Variables** (add all of these):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase pooler URL (6543, `?pgbouncer=true`) |
   | `DIRECT_URL` | Supabase direct URL (5432) |
   | `JWT_SECRET` | `openssl rand -hex 32` (**required**) |
   | `APP_URL` | `https://YOUR-APP.vercel.app` (update after first deploy) |
   | `PROXYCHECK_API_KEY` | your proxycheck key |
   | `DIDIT_API_KEY` / `DIDIT_WORKFLOW_ID` | optional — real ID + liveness |
   | `REALITY_DEFENDER_API_KEY` | optional — deepfake scoring |
   | `BIOMETRIC_RETENTION_DAYS` | `30` |
   | `STRIPE_SECRET_KEY` | for billing + (optionally) Stripe Identity |
   | `STRIPE_WEBHOOK_SECRET` | from the webhook you create in Step 5 |
   | `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_SCALE` | your recurring Price IDs |

3. **Deploy.** After it finishes, copy the real URL and set `APP_URL` to it (candidate links + Stripe return URLs use it), then redeploy.

Done — your app is live at `https://YOUR-APP.vercel.app`. Camera works (Vercel is HTTPS).

---

## Step 5 — Turn on paid plans (Stripe billing) — optional but this is the "sellable" part

The app runs **unmetered** until you wire Stripe, so you can launch a free beta first.
When you're ready to charge:

1. **Stripe → Products.** Create two products with a **monthly recurring price** each:
   - *Starter* (e.g. $149/mo) → copy its Price ID (`price_…`) → `STRIPE_PRICE_STARTER`
   - *Scale* (e.g. $599/mo) → copy its Price ID → `STRIPE_PRICE_SCALE`
   - (Prices/quotas are display + limits set in `src/lib/plans.ts` — change freely.)
2. **Stripe → Developers → API keys.** Copy the **Secret key** → `STRIPE_SECRET_KEY`.
3. **Stripe → Developers → Webhooks → Add endpoint:**
   - URL: `https://YOUR-APP.vercel.app/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
4. **Redeploy.** Now the Billing page shows real **Upgrade** buttons → Stripe Checkout →
   the subscription syncs the org's plan + monthly quota automatically. Once a plan's
   monthly verification quota is hit, new verifications are blocked with an upgrade prompt.
5. **Customer portal** (so customers can change card / cancel): Stripe → Settings →
   Billing → Customer portal → **Activate**. The in-app "Manage subscription" button uses it.

**How metering works:** billing enforcement turns on only when `STRIPE_SECRET_KEY` **and**
at least one `STRIPE_PRICE_*` are set (`features.billing`). Until then every org is
unmetered. Quota = `Org.monthlyQuota` (set from the plan); usage = verifications created
since the 1st of the month. The webhook is the source of truth — the client can't change
its own plan.

> The **same** `STRIPE_SECRET_KEY` also powers the optional Stripe Identity ID-check.
> Billing and Identity are independent features that happen to share the key.

---

## Deepfake analysis & Vercel function limits

The candidate submit runs **Reality Defender** deepfake analysis on the captured frame (~15–40s). The route sets `maxDuration = 60`, which **requires the Vercel Pro plan** — Vercel **Hobby caps functions at 10s** and would time out the deepfake step (it degrades gracefully to "not evaluated", so everything else still works). Render/Railway/Fly have no such limit. For scale, move the deepfake step to a background job using RD's two-step API (`upload` → poll `getResult`) and have the result page poll.

## Notes / gotchas

- **Build command** is already `prisma generate && next build` (in package.json). Vercel runs it automatically; no DB is touched at build time.
- **Use the pooled URL** (`DATABASE_URL`, port 6543) for the app — serverless functions exhaust direct connections otherwise. Migrations use `DIRECT_URL` (5432).
- **Schema changes later:** edit `prisma/schema.prisma`, then `npx prisma db push` from your machine (pointed at Supabase). Vercel does not migrate on deploy.
- **Custom domain:** add it in Vercel → Domains, then set `APP_URL` to it and redeploy.
- **Costs:** Supabase free tier + Vercel Hobby = **$0** to start (Hobby is non-commercial; move to Vercel Pro ~$20/mo once you have paying customers).
