# Orbyt Verify — operating & go-to-market playbook

## 1. How it works / what it does / how to use it

**What it does:** flags fake or impersonated remote candidates before/at the interview. It outputs **fraud signals + a risk score** (Pass / Review / High-risk). It is *not* a background check and collects no SSN/records.

**Pipeline:**
1. Recruiter creates a verification → gets a private candidate link.
2. Candidate opens it, signs two consents (data + biometric).
3. *(optional)* Stripe Identity — real government-ID + selfie + liveness.
4. ~10-second browser check captures real signals; the server adds IP intelligence (proxycheck.io) + email reputation.
5. The scoring engine combines everything into a 0–100 risk score with a transparent per-signal breakdown.
6. Recruiter reviews the verdict and decides. Everything is in a hash-chained audit log.

**The signals (all real):** VPN/proxy/Tor/datacenter (proxycheck), IP-country vs declared, relay latency, device-timezone vs declared, virtual-camera (OBS/ManyCam), browser-automation, motion-liveness (static-photo catch), email reputation (disposable + MX), Stripe ID+selfie+liveness, and a deepfake-content slot.

**How to use it — recruiter:** Sign in → *New verification* (name, email, claimed country) → copy the link → paste it into the interview invite (or have the candidate do it at the start of the call) → watch the result land → Pass/Review/High-risk + breakdown → make your hiring call.

**How to use it — candidate:** open link → consent → (ID step if enabled) → 10-sec camera check → done.

**Scoring bands:** Pass < 20, Review 20–44, High-risk ≥ 45. Weights live in `src/lib/score.ts` — tune them on real cases.

---

## 2. Who buys it / why / how to sell / marketing

**Who:**
- Staffing & recruiting agencies placing **remote contractors** (high volume, their reputation is on the line) — best first customer.
- **Security/IT teams** hiring remote engineers (the "did we just hire a North Korean operative?" fear).
- RPOs, technical recruiting teams, remote-worker marketplaces.

**Why it's the game-changer / why now:** three things collided — (1) remote hiring is now default, (2) deepfake/voice-clone tools are trivial and free, (3) organized + state-sponsored fraud rings (the DPRK IT-worker scheme) industrialized fake-candidate placement. **Incumbents don't cover it:** Checkr/HireRight do records (no liveness), Persona/Onfido do onboarding IDV (not interview fraud, enterprise sales-led). Nobody sells a cheap, self-serve, hiring-context fake-candidate check to the SMB/mid-market. That gap is the wedge.

**Market evidence (refreshed June 2026 — use these in your pitch/deck):**
- **CrowdStrike (2025):** North Korean fraudulent-employment ("Famous Chollima") activity rose **+220% YoY**, infiltrating **320+ companies** in 12 months. ([TechCrunch](https://techcrunch.com/2025/08/04/north-korean-spies-posing-as-remote-workers-have-infiltrated-hundreds-of-companies-says-crowdstrike/), [Fortune](https://fortune.com/2025/08/04/north-korean-it-worker-infiltrations-exploded/))
- **Scale & money:** UN estimates the scheme nets **$250M–$600M/year**; some operatives earn **$300k+**, ~90% routed to the regime. ([CNN](https://www.cnn.com/interactive/2025/08/05/world/north-korea-it-worker-scheme-vis-intl-hnk/index.html))
- **Enforcement is hot:** DOJ ran nationwide raids on **29 laptop farms across 16 states (~200 laptops seized)**; facilitator **Christina Chapman sentenced 8+ years** for helping generate **$17M** across **300+ orgs** using **68 stolen American identities**. ([DOJ](https://www.justice.gov/opa/pr/justice-department-announces-coordinated-nationwide-actions-combat-north-korean-remote))
- **It's mainstream now:** Microsoft tracks the actor as "Jasper Sleet"; AI/deepfakes are used "at every stage of the hiring process." ([Microsoft](https://www.microsoft.com/en-us/security/blog/2025/06/30/jasper-sleet-north-korean-remote-it-workers-evolving-tactics-to-infiltrate-organizations/))
- **The broader fake-candidate wave:** Gartner predicts **1 in 4 candidate profiles will be fake by 2028** (and a 2Q25 survey found **6% of candidates admitted interview fraud**). ([HR Dive](https://www.hrdive.com/news/fake-job-candidates-ai/757126/), [Gartner](https://www.gartner.com/en/newsroom/press-releases/2025-07-31-gartner-survey-shows-just-26-percent-of-job-applicants-trust-ai-will-fairly-evaluate-them))
- **Recruiters are already getting hit:** **17% of hiring managers** reported suspected **deepfake interviews by end of 2024 — up from 3%** a year earlier (Resume Genius). HYPR's 2025 report: **95% of orgs** had a deepfake incident in the past year. ([CNBC](https://www.cnbc.com/2025/07/11/how-deepfake-ai-job-applicants-are-stealing-remote-work.html))
- **Competitors validating the category (but aimed up-market):** Pindrop, Daon, GetReal, Persona "Workforce" — all moving into hiring-fraud, all enterprise/sales-led. Confirms the demand; leaves the self-serve SMB/staffing lane open.

**Why someone buys:** fear of a catastrophic mis-hire (IP theft, security breach, sanctions exposure, public embarrassment), bought as cheap insurance, with zero compliance lift and a 1-day setup.

**How to sell (founder-led):**
1. Reframe everything as "fake-candidate detection," not "background checks."
2. Lead with a scary, true story + a **live demo** (a candidate on a VPN/datacenter gets flagged in real time).
3. Sell to whoever owns remote-hiring risk: agency owner, Head of Talent, or security lead.
4. **Free pilot (50 checks) → paid.** Get one "this caught a fake" testimonial; that becomes your whole pitch.

**Marketing channels:**
- **Content/SEO:** "how to detect fake remote candidates / deepfake interviews / North Korean IT workers."
- **LinkedIn/X:** post the threat + short demo clips of the detection firing.
- **News-jacking:** every DPRK-worker / deepfake-hire headline → your take + demo. There's a fresh one every few weeks.
- **Outbound:** cold email/DM to staffing-agency owners and security leaders.
- **Communities:** recruiting/HR (r/recruiting, talent Slacks) and security (CISO groups).
- **Lead magnet:** a free "verify one candidate" check on the site.

**Positioning line:** *"Catch fake remote candidates before you hire them."*

---

## 3. COGS & operating costs

**Per-verification COGS:**
| Mode | Cost | Notes |
|---|---|---|
| Signals-only (no ID) | **~$0** | proxycheck free 1k/day; latency/device/email free |
| proxycheck beyond free tier | ~$0.001–0.01 | paid plans add volume |
| With Stripe Identity (ID + selfie) | **~$1.50** | only when you run the ID step |
| Deepfake (Reality Defender) | free ~50/mo, then enterprise | defer |

**Fixed/operating (monthly):**
- Vercel Hobby **$0** (Pro ~$20 once you have paying customers / commercial use).
- Supabase free (Pro ~$25 at scale).
- proxycheck free → ~$25–50 for more volume.
- Domain ~$12/yr.
- Transactional email (Resend/Postmark free tier) — optional, for sending links.
- **Total to start: ~$0–50/mo.**

**Margins:** ~99% signals-only; ~85–90% with the ID upgrade. Price $5–15/check or $99–499/mo per seat → very high margin.

---

## 4. Buzz → users → customers → funding

**a) Buzz**
- News-jack the DPRK/deepfake-hire cycle with your demo clips.
- Publish a short **threat teardown / "anatomy of a fake candidate"** post.
- One design partner's "it caught a fake" story is the single best buzz engine — engineer for it.
- Launch where your buyers are (recruiting + security communities), not just generic launch sites.

**b) Users**
- Free self-serve tier (N checks/mo) + a one-click "verify a candidate" lead magnet.
- Outbound to staffing agencies (volume + acute pain).

**c) Customers (paid)**
- Convert pilots: free 50 checks → paid seat. The dashboard already counts billable checks/month.
- Target buyers with budget + pain (agency owners, security leads). Even $99/mo from 5–10 design partners is real validation.

**d) Funding — 1517 and beyond**
- **1517 fit:** young/technical founder, contrarian/frontier thesis, security, pre-seed, pre-revenue OK. A consent-based defense against state-backed fake workers is squarely on-brand for them.
- **Bring:** the live deployed product (you'll have it), the threat evidence, a crisp "why me / why now," and ideally 1–2 buyer conversations or a pilot/LOI.
- **Sequence:** deploy → 5–10 buyer conversations → 1–2 pilots → apply to 1517 *and* security/HR-tech angels (don't depend on one fund); an accelerator (YC) is also reasonable.
- **Narrative:** "Verify is the wedge — cheap, sellable, on-mission. It funds and de-risks the bigger consent-based screening platform that takes on the regulated CRA battle later." Same core IP, sold narrow first.
