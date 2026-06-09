import "dotenv/config";
import { RealityDefender } from "@realitydefender/realitydefender";
const rd = new RealityDefender({ apiKey: process.env.REALITY_DEFENDER_API_KEY });
const r = await rd.detect({ filePath: "/tmp/rd-fake.jpg" });
console.log(JSON.stringify(r, null, 2));
process.exit(0);
