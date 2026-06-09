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
  declaredName?: string;
  idvAvailable?: boolean; // is an IDV provider configured? (distinguishes "skipped by candidate" from "not configured")
  ip: IpIntel;
  email: EmailRisk;
  idv: IdvResult;
  deepfake: DeepfakeResult;
  client: ClientSignals;
}): Verdict {
  const s: Signal[] = [];
  const declared = (input.declaredCountry || "").toUpperCase();
  const c = input.client;

  // 1. ID + selfie + liveness — CRUCIAL. When an IDV provider is configured, a
  // candidate who isn't verified (declined, abandoned, or never started) is a hard
  // fail. Only "not configured at all" is treated as not-evaluated.
  if (input.idv.status === "verified") {
    s.push(sig("idv", "Government ID + selfie match", "verified", -25, false, true, "pass",
      "1:1 ID-to-selfie match and liveness passed via the IDV vendor."));
  } else if (!input.idvAvailable && input.idv.status === "skipped") {
    s.push(sig("idv", "Government ID + selfie match", "not evaluated", 0, false, false, "info",
      "ID verification not configured (add Didit or Stripe Identity to enable)."));
  } else {
    // IDV is available but the candidate is not verified — crucial penalty.
    const reason =
      input.idv.status === "requires_input" ? "ID verification was declined / failed."
      : input.idv.status === "processing" ? "ID verification was started but not completed/approved."
      : input.idv.status === "error" ? "ID verification could not be retrieved."
      : "Candidate did not complete the required government-ID check.";
    s.push(sig("idv", "Government ID + selfie match", input.idv.status === "skipped" ? "not completed" : input.idv.status,
      45, true, true, "risk", `${reason} A real candidate completes 1:1 ID + selfie. This is treated as a hard fail.`));
  }

  // 1b. Name on ID vs. the name the recruiter entered — impersonation tell.
  const declaredName = (input.declaredName ?? "").trim();
  if (input.idv.status === "verified" && declaredName && input.idv.idName) {
    const match = namesMatchLoose(declaredName, input.idv.idName);
    if (match) {
      s.push(sig("namematch", "Name matches ID", "match", -10, false, true, "pass",
        `The name on the government ID ("${input.idv.idName}") matches the candidate name on file.`));
    } else {
      s.push(sig("namematch", "Name matches ID", "mismatch", 40, true, true, "risk",
        `The name on the government ID ("${input.idv.idName}") does NOT match the candidate name on file ("${declaredName}") — strong impersonation signal.`));
    }
  } else if (input.idv.status === "verified" && declaredName && !input.idv.idName) {
    s.push(sig("namematch", "Name matches ID", "not evaluated", 0, false, false, "info",
      "ID verified, but the provider didn't return the name on the document to compare."));
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

  // 10b. Challenge-response liveness (on-device) — graded, harsh. A hard fail
  // (no face / multiple faces / a missed challenge) forces the verdict up; minor
  // quality flags (slow, erratic, abnormal blink) each deduct points.
  const ch = c.challenge;
  if (ch?.ran) {
    if (!ch.faceWasPresent) {
      s.push(sig("challenge", "Live challenge-response", "no live face", 40, true, true, "risk",
        "No live face detected during the on-device challenges — photo / non-present candidate."));
    } else if (ch.multipleFaces) {
      s.push(sig("challenge", "Live challenge-response", "multiple faces", 30, true, true, "risk",
        "More than one face present during the live challenge (off-camera help / impersonation)."));
    } else {
      const failed = ch.challengesTotal - ch.challengesPassed;
      const anomalies = ch.anomalies ?? [];
      let pts = failed * 28 + anomalies.length * 8;
      const sev: Severity = pts >= 22 ? "risk" : pts > 0 ? "warn" : "pass";
      if (pts === 0) pts = -15; // a clean, prompt, natural response earns trust
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
      s.push(sig("email", "Email reputation", "disposable domain", 10, true, true, "risk", "Disposable/temp-mail address."));
    } else if (!input.email.hasMx) {
      s.push(sig("email", "Email reputation", "no MX records", 8, true, true, "warn", "Domain cannot receive mail."));
    } else {
      s.push(sig("email", "Email reputation", input.email.freemail ? "freemail" : "corporate", input.email.freemail ? 0 : -3,
        false, true, "pass", input.email.freemail ? "Consumer email provider." : "Corporate domain with valid mail."));
    }
  }

  // 12. Deepfake content (Reality Defender) — async; may still be processing.
  s.push(deepfakeSignal(input.deepfake));

  return { ...summarizeSignals(s), signals: s };
}

// The deepfake signal, built identically whether it's computed at submit time or
// finalized later by the result-page poll (async pipeline).
export function deepfakeSignal(df: DeepfakeResult): Signal {
  if (df.evaluated && df.syntheticProbability != null) {
    const p = df.syntheticProbability;
    const manipulated = p >= 0.6;
    const out = sig("deepfake", "Deepfake content analysis", `${Math.round(p * 100)}% AI-generated`, manipulated ? 50 : -6, manipulated, true,
      manipulated ? "risk" : "pass", df.note);
    out.info = { models: df.models, requestId: df.requestId, provider: df.provider };
    return out;
  }
  if (df.status === "processing") {
    return sig("deepfake", "Deepfake content analysis", "analyzing…", 0, false, false, "info",
      "Deepfake analysis is running — the result will appear here automatically in a few seconds.");
  }
  return sig("deepfake", "Deepfake content analysis", "not evaluated", 0, false, false, "info", df.note);
}

// Roll a set of signals up into the final verdict. Pure function of the signals,
// so it can re-run when the async deepfake result lands without re-fetching
// everything. Categorical overrides are re-derived from the signals themselves.
export function summarizeSignals(s: Signal[]): { riskScore: number; band: Verdict["band"]; label: string; confidencePct: number } {
  let score = Math.max(0, Math.min(100, s.reduce((a, x) => a + x.points, 0)));
  let band: Verdict["band"] = score >= 45 ? "risk" : score >= 20 ? "review" : "pass";

  // A high-confidence deepfake is a hard fail on its own.
  const df = s.find((x) => x.key === "deepfake");
  const dfPct = df?.evaluated ? Number(/(\d+)%/.exec(df.value)?.[1] ?? NaN) : NaN;
  if (!Number.isNaN(dfPct) && dfPct >= 70) { band = "risk"; score = Math.max(score, 90); }

  // Name on the ID not matching the claimed name is near-conclusive impersonation.
  const nm = s.find((x) => x.key === "namematch");
  if (nm?.triggered && nm.severity === "risk") { band = "risk"; score = Math.max(score, 85); }

  // ID verification is crucial — an available-but-unverified ID forces High-risk.
  const idv = s.find((x) => x.key === "idv");
  if (idv?.triggered && idv.severity === "risk") { if (band === "pass") band = "review"; score = Math.max(score, 45); band = score >= 45 ? "risk" : band; }

  // A failed liveness challenge (no face / multiple faces / missed action) forces
  // at least Review — a real, present person completes the random prompts.
  const ch = s.find((x) => x.key === "challenge");
  const livenessHardFail = !!ch && (["no live face", "multiple faces"].includes(ch.value) || ch.value.startsWith("failed"));
  if (livenessHardFail && band === "pass") { band = "review"; score = Math.max(score, 24); }

  const label = band === "risk" ? "High fraud risk" : band === "review" ? "Review recommended" : "Likely a real, present candidate";
  const confidencePct = s.length ? Math.round((s.filter((x) => x.evaluated).length / s.length) * 100) : 0;
  return { riskScore: score, band, label, confidencePct };
}

// Loose name match: case/punctuation-insensitive, order-independent token overlap.
// Requires every token of the shorter name to appear in the longer (handles middle
// names, "DOE JOHN" vs "John Doe", accents stripped).
export function namesMatchLoose(a: string, b: string): boolean {
  const norm = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((t) => t.length > 1);
  const ta = norm(a), tb = norm(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(long);
  const overlap = short.filter((t) => longSet.has(t)).length;
  return overlap >= Math.min(2, short.length) && overlap / short.length >= 0.6;
}

function sig(key: string, label: string, value: string, points: number, triggered: boolean, evaluated: boolean, severity: Severity, detail: string): Signal {
  return { key, label, value, points, triggered, evaluated, severity, detail };
}
