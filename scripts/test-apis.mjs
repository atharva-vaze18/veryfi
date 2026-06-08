import "dotenv/config";

const mask = (v) => (v ? `set (${v.length} chars)` : "EMPTY");
console.log("=== .env config (values masked) ===");
console.log("  IPQS_API_KEY            :", mask(process.env.IPQS_API_KEY));
console.log("  STRIPE_SECRET_KEY       :", mask(process.env.STRIPE_SECRET_KEY));
console.log("  REALITY_DEFENDER_API_KEY:", mask(process.env.REALITY_DEFENDER_API_KEY));

// 1) IPQS live lookup against a known datacenter IP (Google 8.8.8.8) + Cloudflare.
const ipqs = process.env.IPQS_API_KEY;
if (ipqs) {
  for (const ip of ["8.8.8.8", "45.83.91.1"]) {
    try {
      const r = await fetch(`https://ipqualityscore.com/api/json/ip/${ipqs}/${ip}?strictness=1`, { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      if (j.success === false) { console.log(`\n[IPQS] ${ip}: ${j.message}`); continue; }
      console.log(`\n[IPQS] ${ip}  country=${j.country_code} conn=${j.connection_type} fraud=${j.fraud_score} vpn=${j.vpn} proxy=${j.proxy} tor=${j.tor} ISP=${j.ISP}`);
    } catch (e) { console.log(`\n[IPQS] ${ip}: request failed -> ${e.message}`); }
  }
} else console.log("\n[IPQS] key not set");

// 2) Stripe Identity — create a real verification session to confirm the key + Identity are active.
const sk = process.env.STRIPE_SECRET_KEY;
if (sk) {
  try {
    const body = new URLSearchParams({ type: "document", "options[document][require_matching_selfie]": "true" });
    const r = await fetch("https://api.stripe.com/v1/identity/verification_sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" },
      body, signal: AbortSignal.timeout(12000),
    });
    const j = await r.json();
    if (r.ok) console.log(`\n[Stripe Identity] OK — created session ${j.id}, status=${j.status}, hosted URL present=${!!j.url}`);
    else console.log(`\n[Stripe Identity] error ${r.status}: ${j.error?.message ?? JSON.stringify(j)}`);
  } catch (e) { console.log(`\n[Stripe Identity] request failed -> ${e.message}`); }
} else console.log("\n[Stripe Identity] key not set");

// 3) Reality Defender — key detected; integration is a stub slot (not yet wired to score).
const rd = process.env.REALITY_DEFENDER_API_KEY;
console.log(`\n[Reality Defender] key ${rd ? "detected" : "not set"} — adapter is a slot; deepfake scoring not yet wired (honest "not evaluated").`);
