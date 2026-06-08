import type { IpIntel } from "@/adapters/ipintel";
import type { EmailRisk } from "@/adapters/emailrisk";
import type { IdvResult } from "@/adapters/identity";
import type { DeepfakeResult } from "@/adapters/deepfake";

// Signals captured in the candidate's browser (all real measurements).
export interface ClientSignals {
  timezone?: string; // IANA, e.g. "America/Chicago"
  timezoneOffsetMin?: number; // -new Date().getTimezoneOffset()
  minLatencyMs?: number; // min round-trip across several pings
  hardwareConcurrency?: number;
  deviceMemory?: number;
  userAgent?: string;
  webdriver?: boolean; // navigator.webdriver
  cameraLabels?: string[]; // labels of video input devices
  virtualCameraLabels?: string[]; // subset matching virtual-camera patterns
  livenessRan?: boolean;
  livenessMotion?: boolean; // true = frames changed (live), false = static (photo)
  screen?: { w: number; h: number };
}

export type Severity = "pass" | "info" | "warn" | "risk";

export interface Signal {
  key: string;
  label: string;
  value: string;
  detail: string;
  points: number; // signed contribution to the 0..100 risk score
  triggered: boolean;
  evaluated: boolean;
  severity: Severity;
}

export interface Verdict {
  riskScore: number; // 0..100 (higher = more likely fake/fraudulent)
  band: "pass" | "review" | "risk";
  label: string;
  confidencePct: number; // share of signals actually evaluated
  signals: Signal[];
}

// Compact country → standard UTC offset (minutes) map for the timezone-consistency
// check. Not exhaustive; unknown countries skip the check (reported not-evaluated).
const COUNTRY_OFFSET: Record<string, number> = {
  US: -360, CA: -300, MX: -360, BR: -180, AR: -180, GB: 0, IE: 0, PT: 0,
  FR: 60, DE: 60, ES: 60, IT: 60, NL: 60, SE: 60, PL: 60, CH: 60, NG: 60,
  ZA: 120, EG: 120, IL: 120, TR: 180, SA: 180, RU: 180, AE: 240, PK: 300,
  IN: 330, BD: 360, TH: 420, VN: 420, ID: 420, CN: 480, SG: 480, PH: 480,
  HK: 480, MY: 480, KP: 540, JP: 540, KR: 540, AU: 600, NZ: 720,
};

const VCAM_PATTERNS = /obs|virtual|manycam|snap\s*camera|xsplit|droidcam|epoccam|e2esoft|vcam|fake|avatarify|nvidia broadcast/i;

export function detectVirtualCameras(labels: string[]): string[] {
  return labels.filter((l) => VCAM_PATTERNS.test(l));
}

export function computeVerdict(input: {
  declaredCountry: string;
  ip: IpIntel;
  email: EmailRisk;
  idv: IdvResult;
  deepfake: DeepfakeResult;
  client: ClientSignals;
}): Verdict {
  const s: Signal[] = [];
  const declared = (input.declaredCountry || "").toUpperCase();
  const c = input.client;

  // 1. ID + selfie + liveness (Stripe Identity) — strong trust when verified.
  if (input.idv.status === "skipped") {
    s.push(sig("idv", "Government ID + selfie match", "not evaluated", 0, false, false, "info",
      "ID verification not configured (add Stripe Identity to enable)."));
  } else if (input.idv.status === "verified") {
    s.push(sig("idv", "Government ID + selfie match", "verified", -22, false, true, "pass",
      "1:1 ID-to-selfie match and liveness passed via the IDV vendor."));
  } else {
    s.push(sig("idv", "Government ID + selfie match", input.idv.status, 25, true, true, "risk",
      "ID verification did not complete / did not pass."));
  }

  // 2. VPN / proxy / Tor
  if (input.ip.vpnEvaluated) {
    const anon = !!(input.ip.isVpn || input.ip.isProxy || input.ip.isTor);
    s.push(sig("anon", "VPN / proxy / Tor egress", anon ? "detected" : "none", anon ? 20 : -3, anon, true,
      anon ? "risk" : "pass",
      anon ? "Connection is anonymized — common in remote-impersonation fraud." : "No anonymizing network detected."));
  } else {
    s.push(sig("anon", "VPN / proxy / Tor egress", "not evaluated", 0, false, false, "info",
      "Add IPQualityScore to detect VPN/proxy/Tor."));
  }

  // 3. Datacenter egress
  if (input.ip.vpnEvaluated) {
    const dc = !!input.ip.isDatacenter;
    s.push(sig("datacenter", "Datacenter / hosting IP", dc ? "yes" : "no", dc ? 15 : 0, dc, true,
      dc ? "risk" : "pass",
      dc ? "Traffic originates from a hosting provider, not a residential ISP." : "Residential/mobile connection."));
  }

  // 4. IPQS fraud score
  if (input.ip.fraudScore != null) {
    const f = input.ip.fraudScore;
    const pts = f >= 85 ? 12 : f >= 70 ? 6 : f < 30 ? -4 : 0;
    s.push(sig("fraudscore", "IP fraud score", `${f}/100`, pts, f >= 70, true,
      f >= 85 ? "risk" : f >= 70 ? "warn" : "pass", "IPQualityScore reputation for this address."));
  }

  // 5. Geo mismatch: declared country vs observed IP country
  if (declared && input.ip.country) {
    const mismatch = declared !== input.ip.country.toUpperCase();
    s.push(sig("geo", "Declared vs IP country", `${declared} vs ${input.ip.country.toUpperCase()}`,
      mismatch ? 15 : -2, mismatch, true, mismatch ? "warn" : "pass",
      mismatch ? "Candidate connects from a different country than declared." : "Location matches declared country."));
  } else {
    s.push(sig("geo", "Declared vs IP country", "not evaluated", 0, false, false, "info",
      declared ? "Could not geolocate the IP." : "No declared country provided."));
  }

  // 6. Relay / latency (overseas-access tell)
  if (typeof c.minLatencyMs === "number") {
    const l = c.minLatencyMs;
    const pts = l >= 120 ? 15 : l >= 80 ? 7 : -2;
    s.push(sig("latency", "Network round-trip latency", `${Math.round(l)} ms`, pts, l >= 120, true,
      l >= 120 ? "risk" : l >= 80 ? "warn" : "pass",
      l >= 120 ? "High latency suggests the session is relayed from far away." : "Latency within an expected range."));
  } else {
    s.push(sig("latency", "Network round-trip latency", "not measured", 0, false, false, "info", "Latency was not measured."));
  }

  // 7. Timezone consistency (declared country vs browser timezone)
  if (declared && declared in COUNTRY_OFFSET && typeof c.timezoneOffsetMin === "number") {
    const expected = COUNTRY_OFFSET[declared]!;
    const diff = Math.abs(expected - c.timezoneOffsetMin);
    const mismatch = diff > 180;
    s.push(sig("timezone", "Device timezone vs declared", `${c.timezone ?? c.timezoneOffsetMin + "m"}`,
      mismatch ? 10 : 0, mismatch, true, mismatch ? "warn" : "pass",
      mismatch ? "Device clock timezone does not match the declared country." : "Device timezone consistent with declared country."));
  } else {
    s.push(sig("timezone", "Device timezone vs declared", "not evaluated", 0, false, false, "info",
      "Declared country unknown or unmapped."));
  }

  // 8. Virtual camera (deepfake injection vector)
  if (c.cameraLabels && c.cameraLabels.length) {
    const v = c.virtualCameraLabels ?? [];
    s.push(sig("vcam", "Virtual camera detected", v.length ? v.join(", ") : "none", v.length ? 22 : -2, v.length > 0, true,
      v.length ? "risk" : "pass",
      v.length ? "A virtual camera can inject pre-rendered/deepfake video into the call." : "Only physical camera(s) present."));
  } else {
    s.push(sig("vcam", "Virtual camera detected", "not evaluated", 0, false, false, "info",
      "Camera devices were not enumerated (permission not granted)."));
  }

  // 9. Automation / headless
  if (typeof c.webdriver === "boolean") {
    s.push(sig("automation", "Browser automation / headless", c.webdriver ? "detected" : "no",
      c.webdriver ? 15 : 0, c.webdriver, true, c.webdriver ? "risk" : "pass",
      c.webdriver ? "Session is driven by automation tooling." : "No automation flags."));
  }

  // 10. Liveness (static-photo detection via motion)
  if (c.livenessRan) {
    const live = c.livenessMotion === true;
    s.push(sig("liveness", "Live-presence (motion) check", live ? "live motion" : "static image",
      live ? -8 : 15, !live, true, live ? "pass" : "risk",
      live ? "Camera feed showed natural motion (not a static photo)." : "No motion detected — possible static photo held to camera."));
  } else {
    s.push(sig("liveness", "Live-presence (motion) check", "not run", 0, false, false, "info", "Liveness check was skipped."));
  }

  // 11. Email risk
  if (input.email.evaluated && input.email.valid) {
    if (input.email.disposable) {
      s.push(sig("email", "Email reputation", "disposable domain", 10, true, true, "risk", "Disposable/temp-mail address."));
    } else if (!input.email.hasMx) {
      s.push(sig("email", "Email reputation", "no MX records", 8, true, true, "warn", "Domain cannot receive mail."));
    } else {
      s.push(sig("email", "Email reputation", input.email.freemail ? "freemail" : "corporate", input.email.freemail ? 0 : -3,
        false, true, "pass", input.email.freemail ? "Consumer email provider." : "Corporate domain with valid mail."));
    }
  }

  // 12. Deepfake content (Reality Defender). A confirmed AI-generated/manipulated
  // face is near-conclusive fraud, so it carries heavy weight and, above a high
  // confidence, forces the verdict to High-risk on its own.
  let deepfakeOverride = false;
  if (input.deepfake.evaluated && input.deepfake.syntheticProbability != null) {
    const p = input.deepfake.syntheticProbability;
    const manipulated = p >= 0.6;
    if (p >= 0.7) deepfakeOverride = true;
    s.push(sig("deepfake", "Deepfake content analysis", `${Math.round(p * 100)}% AI-generated`, manipulated ? 50 : -6, manipulated, true,
      manipulated ? "risk" : "pass", input.deepfake.note));
  } else {
    s.push(sig("deepfake", "Deepfake content analysis", "not evaluated", 0, false, false, "info", input.deepfake.note));
  }

  let score = Math.max(0, Math.min(100, s.reduce((a, x) => a + x.points, 0)));
  let band: Verdict["band"] = score >= 45 ? "risk" : score >= 20 ? "review" : "pass";
  // Deterministic override: a high-confidence deepfake is a hard fail.
  if (deepfakeOverride) { band = "risk"; score = Math.max(score, 90); }
  const label = band === "risk" ? "High fraud risk" : band === "review" ? "Review recommended" : "Likely a real, present candidate";
  const evaluated = s.filter((x) => x.evaluated).length;
  return { riskScore: score, band, label, confidencePct: Math.round((evaluated / s.length) * 100), signals: s };
}

function sig(key: string, label: string, value: string, points: number, triggered: boolean, evaluated: boolean, severity: Severity, detail: string): Signal {
  return { key, label, value, points, triggered, evaluated, severity, detail };
}
