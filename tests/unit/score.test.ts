import { describe, it, expect } from "vitest";
import {
  computeVerdict,
  summarizeSignals,
  namesMatchLoose,
  detectVirtualCameras,
  SCORE_VERSION,
  type ClientSignals,
} from "@/lib/score";
import type { IpIntel } from "@/adapters/ipintel";
import type { EmailRisk } from "@/adapters/emailrisk";
import type { IdvResult } from "@/adapters/identity";
import type { DeepfakeResult } from "@/adapters/deepfake";

// ── Fixtures: a clean, real, present candidate ─────────────────────────────────
const cleanIp: IpIntel = {
  evaluated: true, provider: "proxycheck", ip: "203.0.113.7", country: "US",
  region: "TX", city: "Austin", org: "Residential ISP",
  isVpn: false, isProxy: false, isTor: false, isDatacenter: false,
  fraudScore: 5, vpnEvaluated: true,
};
const cleanEmail: EmailRisk = { evaluated: true, domain: "acme.com", disposable: false, freemail: false, hasMx: true, valid: true };
const idvVerified: IdvResult = { status: "verified", selfieMatch: 0.97, livenessPassed: true, provider: "didit", idName: "Jane Q Doe" };
const idvSkipped: IdvResult = { status: "skipped", selfieMatch: null, livenessPassed: null, provider: "none", idName: null };
const dfNotEvaluated: DeepfakeResult = { evaluated: false, provider: "none", syntheticProbability: null, note: "not configured" };
const cleanClient: ClientSignals = {
  timezone: "America/Chicago", timezoneOffsetMin: -300, minLatencyMs: 28,
  webdriver: false, cameraLabels: ["FaceTime HD Camera"], virtualCameraLabels: [],
  livenessRan: true, livenessMotion: true,
  challenge: { ran: true, passed: true, challengesPassed: 2, challengesTotal: 2, multipleFaces: false, faceWasPresent: true, avgResponseMs: 900, anomalies: [] },
};

function verdictOf(overrides: {
  ip?: Partial<IpIntel>; email?: Partial<EmailRisk>; idv?: IdvResult;
  deepfake?: DeepfakeResult; client?: ClientSignals; declaredName?: string;
  declaredCountry?: string; idvAvailable?: boolean;
}) {
  return computeVerdict({
    declaredCountry: overrides.declaredCountry ?? "US",
    declaredName: overrides.declaredName ?? "Jane Doe",
    idvAvailable: overrides.idvAvailable ?? true,
    ip: { ...cleanIp, ...overrides.ip },
    email: { ...cleanEmail, ...overrides.email },
    idv: overrides.idv ?? idvVerified,
    deepfake: overrides.deepfake ?? dfNotEvaluated,
    client: overrides.client ?? cleanClient,
  });
}

// ── Determinism & versioning ───────────────────────────────────────────────────
describe("deterministic, versioned scoring", () => {
  it("same inputs always produce the same score", () => {
    const a = verdictOf({});
    for (let i = 0; i < 5; i++) expect(verdictOf({})).toEqual(a);
  });
  it("exposes a score version", () => {
    expect(SCORE_VERSION).toMatch(/^\d{4}\.\d{2}\.\d+$/);
  });
});

// ── Fraud-signal matrix (from the readiness spec) ──────────────────────────────
describe("fraud-signal matrix", () => {
  it("clean candidate → pass", () => {
    const v = verdictOf({});
    expect(v.band).toBe("pass");
  });

  it("VPN detected, otherwise normal → elevated with explicit reason", () => {
    const v = verdictOf({ ip: { isVpn: true } });
    expect(v.riskScore).toBeGreaterThan(verdictOf({}).riskScore);
    const anon = v.signals.find((s) => s.key === "anon")!;
    expect(anon.triggered).toBe(true);
    expect(anon.severity).toBe("risk");
  });

  it("datacenter IP + timezone mismatch → review or risk", () => {
    const v = verdictOf({
      ip: { isDatacenter: true, country: "NL" },
      client: { ...cleanClient, timezoneOffsetMin: 480, timezone: "Asia/Shanghai" },
    });
    expect(["review", "risk"]).toContain(v.band);
  });

  it("virtual camera label → flagged as a signal, never as proof", () => {
    const labels = detectVirtualCameras(["OBS Virtual Camera"]);
    expect(labels.length).toBe(1);
    const v = verdictOf({ client: { ...cleanClient, cameraLabels: ["OBS Virtual Camera"], virtualCameraLabels: labels } });
    const vcam = v.signals.find((s) => s.key === "vcam")!;
    expect(vcam.triggered).toBe(true);
    expect(vcam.detail).not.toMatch(/proof|fraudster|definitely/i);
  });

  it("no face during challenge → hard liveness failure, never pass", () => {
    const v = verdictOf({
      client: { ...cleanClient, challenge: { ran: true, passed: false, challengesPassed: 0, challengesTotal: 2, multipleFaces: false, faceWasPresent: false, anomalies: [] } },
    });
    expect(v.band).not.toBe("pass");
  });

  it("multiple faces → flagged", () => {
    const v = verdictOf({
      client: { ...cleanClient, challenge: { ran: true, passed: false, challengesPassed: 1, challengesTotal: 2, multipleFaces: true, faceWasPresent: true, anomalies: [] } },
    });
    expect(v.band).not.toBe("pass");
  });

  it("automation signal raises risk", () => {
    const v = verdictOf({ client: { ...cleanClient, webdriver: true } });
    expect(v.riskScore).toBeGreaterThan(verdictOf({}).riskScore);
  });

  it("disposable email + datacenter IP → elevated risk", () => {
    const v = verdictOf({ email: { disposable: true }, ip: { isDatacenter: true } });
    expect(v.riskScore).toBeGreaterThanOrEqual(verdictOf({}).riskScore + 20);
  });
});

// ── Unknown-data handling: unavailable ≠ clean ─────────────────────────────────
describe("unknown-data handling", () => {
  it("IP provider outage contributes zero points (never negative)", () => {
    const v = verdictOf({ ip: { vpnEvaluated: false, isVpn: null, isProxy: null, isTor: null, isDatacenter: null, fraudScore: null } });
    const anon = v.signals.find((s) => s.key === "anon")!;
    expect(anon.evaluated).toBe(false);
    expect(anon.points).toBe(0);
  });

  it("a fully-unknown session does not look cleaner than a clean session", () => {
    const unknown = verdictOf({
      ip: { vpnEvaluated: false, country: null, isVpn: null, isProxy: null, isTor: null, isDatacenter: null, fraudScore: null },
      email: { evaluated: false },
      idv: idvSkipped,
      idvAvailable: false,
      client: {},
    });
    const clean = verdictOf({});
    expect(unknown.riskScore).toBeGreaterThanOrEqual(clean.riskScore);
    expect(unknown.confidencePct).toBeLessThan(clean.confidencePct);
  });
});

// ── Hard-fail overrides ────────────────────────────────────────────────────────
describe("hard-fail overrides", () => {
  it("deepfake ≥70% forces High risk regardless of other clean signals", () => {
    const v = verdictOf({
      deepfake: { evaluated: true, provider: "Reality Defender", syntheticProbability: 0.85, status: "MANIPULATED", note: "RD" },
    });
    expect(v.band).toBe("risk");
    expect(v.riskScore).toBeGreaterThanOrEqual(90);
  });

  it("ID available but not completed is crucial → High risk", () => {
    const v = verdictOf({ idv: idvSkipped, idvAvailable: true });
    expect(v.band).toBe("risk");
  });

  it("ID not configured at all → honest not-evaluated, no penalty", () => {
    const v = verdictOf({ idv: idvSkipped, idvAvailable: false });
    const idv = v.signals.find((s) => s.key === "idv")!;
    expect(idv.evaluated).toBe(false);
    expect(idv.points).toBe(0);
  });

  it("name on ID ≠ declared name → High risk (impersonation)", () => {
    const v = verdictOf({ declaredName: "Robert Smith" }); // ID says Jane Q Doe
    expect(v.band).toBe("risk");
    expect(v.riskScore).toBeGreaterThanOrEqual(85);
  });
});

// ── Verdict bands & labels ─────────────────────────────────────────────────────
describe("three-way verdict", () => {
  it("uses pass/review/risk with human labels, no accusations", () => {
    const v = verdictOf({});
    expect(["pass", "review", "risk"]).toContain(v.band);
    expect(v.label).not.toMatch(/fraudster|North Korean|criminal/i);
  });

  it("summarizeSignals respects custom band thresholds", () => {
    const signals = [
      { key: "x", label: "x", value: "v", detail: "", points: 30, triggered: true, evaluated: true, severity: "warn" as const },
    ];
    expect(summarizeSignals(signals, { pass: 20, review: 45 }).band).toBe("review");
    expect(summarizeSignals(signals, { pass: 10, review: 25 }).band).toBe("risk");
    expect(summarizeSignals(signals, { pass: 35, review: 60 }).band).toBe("pass");
  });

  it("score is clamped to 0..100", () => {
    const heavy = Array.from({ length: 10 }, (_, i) => ({
      key: `k${i}`, label: "x", value: "v", detail: "", points: 50, triggered: true, evaluated: true, severity: "risk" as const,
    }));
    expect(summarizeSignals(heavy).riskScore).toBeLessThanOrEqual(100);
    const negative = [{ key: "n", label: "x", value: "v", detail: "", points: -60, triggered: false, evaluated: true, severity: "pass" as const }];
    expect(summarizeSignals(negative).riskScore).toBeGreaterThanOrEqual(0);
  });
});

// ── Name matching ──────────────────────────────────────────────────────────────
describe("namesMatchLoose", () => {
  it("matches case, order, accents, middle names", () => {
    expect(namesMatchLoose("Jane Doe", "DOE JANE")).toBe(true);
    expect(namesMatchLoose("José García", "Jose Garcia")).toBe(true);
    expect(namesMatchLoose("Jane Doe", "Jane Q Doe")).toBe(true);
  });
  it("rejects different people and junk", () => {
    expect(namesMatchLoose("Jane Doe", "Robert Smith")).toBe(false);
    expect(namesMatchLoose("", "Jane Doe")).toBe(false);
  });
});
