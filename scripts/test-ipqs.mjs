import "dotenv/config";

const mask = (v) => (v ? `set (${v.length} chars)` : "EMPTY");
console.log("=== .env config (values masked) ===");
console.log("  IPQS_API_KEY           :", mask(process.env.IPQS_API_KEY));
console.log("  STRIPE_SECRET_KEY      :", mask(process.env.STRIPE_SECRET_KEY));
console.log("  REALITY_DEFENDER_API_KEY:", mask(process.env.REALITY_DEFENDER_API_KEY));
console.log("  JWT_SECRET             :", process.env.JWT_SECRET && !process.env.JWT_SECRET.includes("dev-only") ? "set (custom)" : "DEFAULT (change before prod)");

const key = process.env.IPQS_API_KEY;
if (!key) { console.log("\nIPQS key not set — nothing to test."); process.exit(0); }

// Live lookup against a few public IPs (8.8.8.8 = Google datacenter).
const TEST_IPS = ["8.8.8.8", "1.1.1.1"];
for (const ip of TEST_IPS) {
  try {
    const r = await fetch(`https://ipqualityscore.com/api/json/ip/${key}/${ip}?strictness=1`, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (j.success === false) { console.log(`\n${ip}: API error -> ${j.message}`); continue; }
    console.log(`\n=== LIVE IPQS lookup: ${ip} ===`);
    console.log("  success      :", j.success);
    console.log("  country      :", j.country_code, "·", j.region, j.city);
    console.log("  ISP / org    :", j.ISP ?? j.organization);
    console.log("  connection   :", j.connection_type);
    console.log("  fraud_score  :", j.fraud_score);
    console.log("  vpn/proxy/tor:", j.vpn, "/", j.proxy, "/", j.tor);
  } catch (e) {
    console.log(`\n${ip}: request failed -> ${e.message}`);
  }
}
