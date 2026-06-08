import "dotenv/config";
import { RealityDefender } from "@realitydefender/realitydefender";

const key = process.env.REALITY_DEFENDER_API_KEY;
if (!key) { console.log("REALITY_DEFENDER_API_KEY not set"); process.exit(0); }

const file = process.argv[2] || "/tmp/rd-fake.jpg";
console.log("RD key:", `set (${key.length} chars)`);
console.log("analyzing:", file, "…");
const rd = new RealityDefender({ apiKey: key });
try {
  const result = await rd.detect({ filePath: file });
  console.log("status:", result.status, "| score:", result.score);
  console.log(JSON.stringify(result, null, 2).slice(0, 600));
} catch (e) {
  console.log("RD error:", e?.message ?? e);
}
process.exit(0);
