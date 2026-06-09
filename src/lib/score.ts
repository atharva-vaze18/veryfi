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
  // On-device challenge-response liveness (MediaPipe). The strongest live signal.
  challenge?: {
    ran: boolean;
    passed: boolean;
    challengesPassed: number;
    challengesTotal: number;
    multipleFaces: boolean;
    faceWasPresent: boolean;
    avgResponseMs?: number | null;
    anomalies?: string[];
  };
}

const ANOMALY_LABEL: Record<string, string> = {
  turn_no_response: "didn't turn head",
  blink_no_response: "didn't blink",
  closer_no_response: "didn't move closer",
  turn_slow: "slow to turn",
  blink_slow: "slow to blink",
  closer_slow: "slow to move closer",
  turn_weak: "head turn too slight",
  blink_abnormal: "abnormal blink count",
  closer_erratic: "approach not smooth/monotonic",
  face_dropout: "face dropped out of frame",
};

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
  // Optional rich detail (e.g. deepfake per-model breakdown + provider link).
  info?: {
    models?: Array<{ name: string; status: string; score: number }>;
    requestId?: string;
    provider?: string;
  };
}

export interface Verdict {
  riskScore: number; // 0..100 (higher = more likely fake/fraudulent)
  band: "pass" | "review" | "risk";
  label: string;
  confidencePct: number; // share of signals actually evaluated
  signals: Signal[];
}

// Feature 4: All hardcoded weights extracted here so they can be overridden per-org.
// Maps signal key → default risk points (positive = adds risk, negative = reduces it).
export const DEFAULT_WEIGHTS: Record<string, number> = {
  idv_verified: -22,
  idv_failed: 25,
  anon_detected: 20,
  anon_none: -3,
  datacenter: 15,
  fraudscore_high: 12,
  fraudscore_mid: 6,
  fraudscore_low: -4,
  geo_mismatch: 15,
  geo_match: -2,
  latency_high: 15,
  latency_mid: 7,
  latency_low: -2,
  timezone_mismatch: 10,
  vcam_detected: 22,
  vcam_none: -2,
  automation: 15,
  liveness_static: 15,
  liveness_live: -8,
  challenge_no_face: 40,
  challenge_multiple_faces: 30,
  challenge_failed_per: 28,     // per failed challenge
  challenge_anomaly_per: 8,     // per anomaly
  challenge_passed: -15,
  email_disposable: 10,
  email_no_mx: 8,
  email_corporate: -3,
  deepfake_manipulated: 50,
  deepfake_authentic: -6,
  // Feature 5: behavioral biometrics
  behavioral_scripted: 15,
  behavioral_coaching: 10,
};

export interface ScoringProfile {
  weightsJson: string;         // JSON object overriding DEFAULT_WEIGHTS keys
  bandThresholds: string;      // JSON: {pass: number, review: number}
  useGlobalDefaults: boolean;
}

function resolveWeights(profile?: ScoringProfile | null): Record<string, number> {
  if (!profile || profile.useGlobalDefaults) return DEFAULT_WEIGHTS;
  try {
    const overrides = JSON.parse(profile.weightsJson) as Record<string, number>;
    return { ...DEFAULT_WEIGHTS, ...overrides };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

function resolveBandThresholds(profile?: ScoringProfile | null): { pass: number; review: number } {
  if (!profile || profile.useGlobalDefaults) return { pass: 20, review: 45 };
  try {
    const t = JSON.parse(profile.bandThresholds) as { pass?: number; review?: number };
    return { pass: t.pass ?? 20, review: t.review ?? 45 };
  } catch {
    return { pass: 20, review: 45 };
  }
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

export function computeVerdict(
  input: {
    declaredCountry: string;
    ip: IpIntel;
    email: EmailRisk;
    idv: IdvResult;
    deepfake: DeepfakeResult;
    client: ClientSignals;
    behavioral?: BehavioralSignals | null;
  },
  profile?: ScoringProfile | null,
): Verdict {
  const w = resolveWeights(profile);
  const thresholds = resolveBandThresholds(profile);
  const s: Signal[] = [];
  const declared = (input.declaredCountry || "").toUpperCase();
  const c = input.client;

  // 1. ID + selfie + liveness (Stripe Identity) — strong trust when verified.
  if (input.idv.status === "skipped") {
    s.push(sig("idv", "Government ID + selfie match", "not evaluated", 0, false, false, "info",
      "ID verification not configured (add Stripe Identity to enable)."));
  } else if (input.idv.status === "verified") {
    s.push(sig("idv", "Government ID + selfie match", "verified", w.idv_verified ?? -22, false, true, "pass",
      "1:1 ID-to-selfie match and liveness passed via the IDV vendor."));
  } else {
    s.push(sig("idv", "Government ID + selfie match", input.idv.status, w.idv_failed ?? 25, true, true, "risk",
      "ID verification did not complete / did not pass."));
  }

  // 2. VPN / proxy / Tor
  if (input.ip.vpnEvaluated) {
    const anon = !!(input.ip.isVpn || input.ip.isProxy || input.ip.isTor);
    s.push(sig("anon", "VPN / proxy / Tor egress", anon ? "detected" : "none", anon ? (w.anon_detected ?? 20) : (w.anon_none ?? -3), anon, true,
      anon ? "risk" : "pass",
      anon ? "Connection is anonymized — common in remote-impersonation fraud." : "No anonymizing network detected."));
  } else {
    s.push(sig("anon", "VPN / proxy / Tor egress", "not evaluated", 0, false, false, "info",
      "Add IPQualityScore to detect VPN/proxy/Tor."));
  }

  // 3. Datacenter egress
  if (input.ip.vpnEvaluated) {
    const dc = !!input.ip.isDatacenter;
    s.push(sig("datacenter", "Datacenter / hosting IP", dc ? "yes" : "no", dc ? (w.datacenter ?? 15) : 0, dc, true,
      dc ? "risk" : "pass",
      dc ? "Traffic originates from a hosting provider, not a residential ISP." : "Residential/mobile connection."));
  }

  // 4. IPQS fraud score
  if (input.ip.fraudScore != null) {
    const f = input.ip.fraudScore;
    const pts = f >= 85 ? (w.fraudscore_high ?? 12) : f >= 70 ? (w.fraudscore_mid ?? 6) : f < 30 ? (w.fraudscore_low ?? -4) : 0;
    s.push(sig("fraudscore", "IP fraud score", `${f}/100`, pts, f >= 70, true,
      f >= 85 ? "risk" : f >= 70 ? "warn" : "pass", "IPQualityScore reputation for this address."));
  }

  // 5. Geo mismatch: declared country vs observed IP country
  if (declared && input.ip.country) {
    const mismatch = declared !== input.ip.country.toUpperCase();
    s.push(sig("geo", "Declared vs IP country", `${declared} vs ${input.ip.country.toUpperCase()}`,
      mismatch ? (w.geo_mismatch ?? 15) : (w.geo_match ?? -2), mismatch, true, mismatch ? "warn" : "pass",
      mismatch ? "Candidate connects from a different country than declared." : "Location matches declared country."));
  } else {
    s.push(sig("geo", "Declared vs IP country", "not evaluated", 0, false, false, "info",
      declared ? "Could not geolocate the IP." : "No declared country provided."));
  }

  // 6. Relay / latency (overseas-access tell)
  if (typeof c.minLatencyMs === "number") {
    const l = c.minLatencyMs;
    const pts = l >= 120 ? (w.latency_high ?? 15) : l >= 80 ? (w.latency_mid ?? 7) : (w.latency_low ?? -2);
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
      mismatch ? (w.timezone_mismatch ?? 10) : 0, mismatch, true, mismatch ? "warn" : "pass",
      mismatch ? "Device clock timezone does not match the declared country." : "Device timezone consistent with declared country."));
  } else {
    s.push(sig("timezone", "Device timezone vs declared", "not evaluated", 0, false, false, "info",
      "Declared country unknown or unmapped."));
  }

  // 8. Virtual camera (deepfake injection vector)
  if (c.cameraLabels && c.cameraLabels.length) {
    const v = c.virtualCameraLabels ?? [];
    s.push(sig("vcam", "Virtual camera detected", v.length ? v.join(", ") : "none", v.length ? (w.vcam_detected ?? 22) : (w.vcam_none ?? -2), v.length > 0, true,
      v.length ? "risk" : "pass",
      v.length ? "A virtual camera can inject pre-rendered/deepfake video into the call." : "Only physical camera(s) present."));
  } else {
    s.push(sig("vcam", "Virtual camera detected", "not evaluated", 0, false, false, "info",
      "Camera devices were not enumerated (permission not granted)."));
  }

  // 9. Automation / headless
  if (typeof c.webdriver === "boolean") {
    s.push(sig("automation", "Browser automation / headless", c.webdriver ? "detected" : "no",
      c.webdriver ? (w.automation ?? 15) : 0, c.webdriver, true, c.webdriver ? "risk" : "pass",
      c.webdriver ? "Session is driven by automation tooling." : "No automation flags."));
  }

  // 10. Liveness (static-photo detection via motion)
  if (c.livenessRan) {
    const live = c.livenessMotion === true;
    s.push(sig("liveness", "Live-presence (motion) check", live ? "live motion" : "static image",
      live ? (w.liveness_live ?? -8) : (w.liveness_static ?? 15), !live, true, live ? "pass" : "risk",
      live ? "Camera feed showed natural motion (not a static photo)." : "No motion detected — possible static photo held to camera."));
  } else {
    s.push(sig("liveness", "Live-presence (motion) check", "not run", 0, false, false, "info", "Liveness check was skipped."));
  }

  // 10b. Challenge-response liveness (on-device) — graded, harsh.
  let livenessHardFail = false;
  const ch = c.challenge;
  if (ch?.ran) {
    if (!ch.faceWasPresent) {
      livenessHardFail = true;
      s.push(sig("challenge", "Live challenge-response", "no live face", w.challenge_no_face ?? 40, true, true, "risk",
        "No live face detected during the on-device challenges — photo / non-present candidate."));
    } else if (ch.multipleFaces) {
      livenessHardFail = true;
      s.push(sig("challenge", "Live challenge-response", "multiple faces", w.challenge_multiple_faces ?? 30, true, true, "risk",
        "More than one face present during the live challenge (off-camera help / impersonation)."));
    } else {
      const failed = ch.challengesTotal - ch.challengesPassed;
      const anomalies = ch.anomalies ?? [];
      let pts = failed * (w.challenge_failed_per ?? 28) + anomalies.length * (w.challenge_anomaly_per ?? 8);
      if (failed > 0) livenessHardFail = true;
      const sev: Severity = pts >= 22 ? "risk" : pts > 0 ? "warn" : "pass";
      if (pts === 0) pts = w.challenge_passed ?? -15;
      const flags = anomalies.map((a) => ANOMALY_LABEL[a] ?? a);
      const value = failed > 0 ? `failed ${ch.challengesPassed}/${ch.challengesTotal}` : flags.length ? `passed, ${flags.length} flag(s)` : `passed ${ch.challengesPassed}/${ch.challengesTotal}`;
      const detail =
        failed > 0
          ? `Did not complete ${failed} live action(s)${flags.length ? `; also: ${flags.join(", ")}` : ""}. Common for static photos and real-time deepfakes.`
          : flags.length
            ? `Live actions completed but with anomalies: ${flags.join(", ")}${ch.avgResponseMs ? ` (avg response ${Math.round(ch.avgResponseMs)}ms)` : ""}.`
            : `Performed all random live actions cleanly and promptly${ch.avgResponseMs ? ` (avg ${Math.round(ch.avgResponseMs)}ms)` : ""} — strong evidence of a real, present person.`;
      s.push(sig("challenge", "Live challenge-response", value, pts, pts > 0, true, sev, detail));
    }
  } else {
    s.push(sig("challenge", "Live challenge-response", "not evaluated", 0, false, false, "info",
      "On-device liveness challenge did not run (model unavailable or camera not granted)."));
  }

  // 11. Email risk
  if (input.email.evaluated && input.email.valid) {
    if (input.email.disposable) {
      s.push(sig("email", "Email reputation", "disposable domain", w.email_disposable ?? 10, true, true, "risk", "Disposable/temp-mail address."));
    } else if (!input.email.hasMx) {
      s.push(sig("email", "Email reputation", "no MX records", w.email_no_mx ?? 8, true, true, "warn", "Domain cannot receive mail."));
    } else {
      s.push(sig("email", "Email reputation", input.email.freemail ? "freemail" : "corporate", input.email.freemail ? 0 : (w.email_corporate ?? -3),
        false, true, "pass", input.email.freemail ? "Consumer email provider." : "Corporate domain with valid mail."));
    }
  }

  // 12. Deepfake content (Reality Defender).
  let deepfakeOverride = false;
  if (input.deepfake.evaluated && input.deepfake.syntheticProbability != null) {
    const p = input.deepfake.syntheticProbability;
    const manipulated = p >= 0.6;
    if (p >= 0.7) deepfakeOverride = true;
    const df = sig("deepfake", "Deepfake content analysis", `${Math.round(p * 100)}% AI-generated`, manipulated ? (w.deepfake_manipulated ?? 50) : (w.deepfake_authentic ?? -6), manipulated, true,
      manipulated ? "risk" : "pass", input.deepfake.note);
    df.info = { models: input.deepfake.models, requestId: input.deepfake.requestId, provider: input.deepfake.provider };
    s.push(df);
  } else {
    s.push(sig("deepfake", "Deepfake content analysis", "not evaluated", 0, false, false, "info", input.deepfake.note));
  }

  // Feature 5: Behavioral biometrics
  if (input.behavioral) {
    const b = input.behavioral;
    const scripted = b.pasteName === true && (b.focusBlurCount ?? 0) > 3 && (b.timeOnConsentMs ?? Infinity) < 8000;
    const coaching = (b.focusBlurCount ?? 0) > 5;
    if (scripted) {
      s.push(sig("behavioral_scripted", "Automated interaction pattern", "detected",
        w.behavioral_scripted ?? 15, true, true, "warn",
        "Paste-detected, frequent tab-switches, and very fast consent completion suggest an automated or assisted session."));
    }
    if (coaching) {
      s.push(sig("behavioral_coaching", "Coaching detected", `${b.focusBlurCount} focus/blur events`,
        w.behavioral_coaching ?? 10, true, true, "warn",
        "High number of tab focus/blur events during the camera step suggests off-screen coaching."));
    }
  }

  let score = Math.max(0, Math.min(100, s.reduce((a, x) => a + x.points, 0)));
  let band: Verdict["band"] = score >= thresholds.review ? "risk" : score >= thresholds.pass ? "review" : "pass";
  if (deepfakeOverride) { band = "risk"; score = Math.max(score, 90); }
  if (livenessHardFail && band === "pass") { band = "review"; score = Math.max(score, thresholds.pass + 4); }
  const label = band === "risk" ? "High fraud risk" : band === "review" ? "Review recommended" : "Likely a real, present candidate";
  const evaluated = s.filter((x) => x.evaluated).length;
  return { riskScore: score, band, label, confidencePct: Math.round((evaluated / s.length) * 100), signals: s };
}

export interface BehavioralSignals {
  pasteName?: boolean;
  focusBlurCount?: number;
  timeOnConsentMs?: number;
  timeOnCameraMs?: number;
  mousePathLength?: number;
  mouseDirectionChanges?: number;
  scrollEventCount?: number;
  totalScrollDistance?: number;
  keystrokeCount?: number;
  isTouchDevice?: boolean;
}

function sig(key: string, label: string, value: string, points: number, triggered: boolean, evaluated: boolean, severity: Severity, detail: string): Signal {
  return { key, label, value, points, triggered, evaluated, severity, detail };
}
