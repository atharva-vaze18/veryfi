# Legal positioning — why this isn't a CRA (and what you DO need)

> Not legal advice. This is the strategy and the design intent. **Get a short consult with an FCRA/privacy attorney (~$1–2k) before charging customers.** That single step de-risks the whole product.

## The line you must not cross

US background-screening regulation (FCRA) triggers when you produce a **"consumer report"** — information bearing on someone's **character, criminal/credit/employment history, etc.** — that a third party uses for an **employment decision**. Do that for a fee and you're a **Consumer Reporting Agency** (credentialing, audits, adverse-action law).

**Orbyt Verify is built to stay on the safe side of that line:**

| CRA / consumer report (avoid) | Orbyt Verify (this product) |
|---|---|
| Criminal, credit, employment, education history | **None collected** |
| SSN / DOB / background records | **None collected** |
| A "report" evaluating the person's background | **Real-time fraud/identity signals** |
| You decide / recommend the hire | **Customer decides — you output signals** |

You are doing **identity assurance and fraud detection** — the same category as Stripe Identity, Persona, iProov — none of which are CRAs.

## The compliance you DO need (lighter, no credentialing)

1. **Biometric consent (BIPA / state laws).** If you use ID + selfie (Stripe Identity), you process biometrics. You need **separate written consent** with a **retention/deletion schedule** stating it's **1:1 verification only**. Built in: `src/lib/consent.ts` (the `BIOMETRIC` document) + the candidate consent step. Stripe holds the biometric; this app stores only the result.
2. **Privacy / data-processing consent.** The `DATA_PROCESSING` consent covers analyzing connection/device signals for fraud. Built in.
3. **A privacy policy + DPA** for your customers (standard SaaS).
4. **GDPR**, if you have EU candidates: explicit consent for the biometric step; keep all face ops 1:1; consider a DPIA before scale.

## Guardrails to keep it defensible

- **Frame outputs as fraud/security signals, not adverse background findings.** "Risk score" + signals, never "do not hire."
- **The customer makes the decision.** You're a tool, not the decider.
- **Don't add records.** The moment you bolt on criminal/employment lookups, you're back in CRA land — that's the *separate, later* regulated product.
- **Be honest about provenance.** Signals that weren't measured say "not evaluated." Never fabricate.

## The attorney checklist (bring this)

- Confirm the product, positioned as fraud/identity tooling with the customer as decision-maker, is not a "consumer report" in your target states.
- Review the two consent documents + retention schedule (BIPA-sensitive states: IL, TX, WA).
- Confirm biometric retention/deletion (default 30 days, set via `BIOMETRIC_RETENTION_DAYS`).
- Advise on EU/GDPR if you'll have EU candidates.
