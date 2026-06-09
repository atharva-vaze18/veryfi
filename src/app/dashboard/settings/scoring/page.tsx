"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import { DEFAULT_WEIGHTS, computeVerdict } from "@/lib/score";

const SIGNAL_LABELS: Record<string, string> = {
  idv_verified: "ID verified (trust bonus)",
  idv_failed: "ID failed",
  anon_detected: "VPN/proxy detected",
  anon_none: "No VPN (trust)",
  datacenter: "Datacenter IP",
  geo_mismatch: "Geo mismatch",
  geo_match: "Geo matches (trust)",
  latency_high: "High latency",
  latency_mid: "Moderate latency",
  latency_low: "Low latency (trust)",
  timezone_mismatch: "Timezone mismatch",
  vcam_detected: "Virtual camera",
  vcam_none: "Physical camera (trust)",
  automation: "Browser automation",
  liveness_static: "Static photo (no motion)",
  liveness_live: "Live motion (trust)",
  challenge_no_face: "Challenge: no face",
  challenge_multiple_faces: "Challenge: multiple faces",
  challenge_passed: "Challenge passed (trust)",
  email_disposable: "Disposable email",
  email_no_mx: "No MX records",
  email_corporate: "Corporate email (trust)",
  deepfake_manipulated: "Deepfake detected",
  deepfake_authentic: "Authentic face (trust)",
  behavioral_scripted: "Automated interaction",
  behavioral_coaching: "Coaching pattern",
};

const PREVIEW_SIGNALS = ["anon_detected", "geo_mismatch", "latency_high", "vcam_detected", "automation"];

export default function ScoringPage() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [weights, setWeights] = useState<Record<string, number>>({ ...DEFAULT_WEIGHTS });
  const [passThreshold, setPassThreshold] = useState(20);
  const [reviewThreshold, setReviewThreshold] = useState(45);
  const [useGlobal, setUseGlobal] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scoring-profile").then(async (r) => {
      if (!r.ok) return;
      const d = await r.json();
      setUseGlobal(d.useGlobalDefaults);
      try {
        const ov = JSON.parse(d.weightsJson) as Record<string, number>;
        setWeights({ ...DEFAULT_WEIGHTS, ...ov });
      } catch { /* keep defaults */ }
      try {
        const t = JSON.parse(d.bandThresholds) as { pass?: number; review?: number };
        if (t.pass != null) setPassThreshold(t.pass);
        if (t.review != null) setReviewThreshold(t.review);
      } catch { /* keep defaults */ }
    });
  }, []);

  async function save() {
    setSaving(true); setErr(null); setSaved(false);
    const overrides: Record<string, number> = {};
    for (const [k, v] of Object.entries(weights)) {
      if (v !== DEFAULT_WEIGHTS[k]) overrides[k] = v;
    }
    try {
      const r = await fetch("/api/scoring-profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weightsJson: JSON.stringify(useGlobal ? {} : overrides),
          bandThresholds: JSON.stringify({ pass: passThreshold, review: reviewThreshold }),
          useGlobalDefaults: useGlobal,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setSaved(true);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  function reset() {
    setWeights({ ...DEFAULT_WEIGHTS });
    setPassThreshold(20);
    setReviewThreshold(45);
    setUseGlobal(true);
  }

  // Live preview: compute a hypothetical score using the current weights.
  const previewScore = PREVIEW_SIGNALS.reduce((sum, key) => sum + (weights[key] ?? 0), 0);
  const previewBand = previewScore >= reviewThreshold ? "risk" : previewScore >= passThreshold ? "review" : "pass";

  const displayWeights = useGlobal ? DEFAULT_WEIGHTS : weights;

  return (
    <div>
      <div className="mb-6">
        <div className="text-muted text-sm mb-1">
          <Link href="/dashboard" className="hover:text-accent">Dashboard</Link>
          {" → "}Settings → Scoring
        </div>
        <h1 className="font-display text-3xl text-ink">Scoring profile</h1>
        <p className="text-muted text-sm mt-1">Tune per-signal weights and band thresholds for your hiring context.</p>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={useGlobal} onChange={(e) => setUseGlobal(e.target.checked)} className="accent-[#4d8dff]" />
          <span className="text-sm text-ink">Use global defaults (recommended)</span>
        </label>
        <button onClick={reset} className="btn-ghost text-xs py-1.5 ml-auto">Reset to defaults</button>
      </div>

      {/* Band thresholds */}
      <div className="panel p-5 mb-6">
        <div className="label mb-3">Band thresholds</div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="label block mb-1">Flag as review above</label>
            <div className="flex items-center gap-3">
              <input type="range" min={5} max={80} value={passThreshold} disabled={useGlobal}
                onChange={(e) => setPassThreshold(Number(e.target.value))} className="flex-1 accent-[#4d8dff]" />
              <span className="font-mono text-sm text-ink w-8 text-right">{passThreshold}</span>
            </div>
          </div>
          <div>
            <label className="label block mb-1">Flag as risk above</label>
            <div className="flex items-center gap-3">
              <input type="range" min={20} max={95} value={reviewThreshold} disabled={useGlobal}
                onChange={(e) => setReviewThreshold(Number(e.target.value))} className="flex-1 accent-[#4d8dff]" />
              <span className="font-mono text-sm text-ink w-8 text-right">{reviewThreshold}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Signal weights */}
      <div className="panel p-5 mb-6">
        <div className="label mb-3">Signal weights</div>
        <div className="space-y-3">
          {Object.entries(displayWeights).map(([key, defaultVal]) => {
            const current = useGlobal ? defaultVal : (weights[key] ?? defaultVal);
            const isModified = !useGlobal && current !== DEFAULT_WEIGHTS[key];
            return (
              <div key={key} className="flex items-center gap-3">
                <span className={`text-sm flex-1 ${isModified ? "text-accent" : "text-ink"}`}>
                  {SIGNAL_LABELS[key] ?? key}
                </span>
                <input type="range" min={-30} max={60} value={current} disabled={useGlobal}
                  onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                  className="w-40 accent-[#4d8dff]" />
                <span className={`font-mono text-xs w-10 text-right ${current > 0 ? "text-risk" : current < 0 ? "text-pass" : "text-muted"}`}>
                  {current > 0 ? "+" : ""}{current}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live preview */}
      <div className="panel p-5 mb-6">
        <div className="label mb-2">Live preview — 5-signal scenario</div>
        <p className="text-xs text-muted mb-3">Hypothetical: VPN + geo mismatch + high latency + virtual camera + automation all triggered.</p>
        <div className="flex items-center gap-4">
          <div className="font-display text-3xl text-ink">{Math.max(0, Math.min(100, previewScore))}</div>
          <div className={`font-mono text-sm px-3 py-1 rounded border ${
            previewBand === "risk" ? "text-risk border-risk/40 bg-risk/10" :
            previewBand === "review" ? "text-review border-review/40 bg-review/10" :
            "text-pass border-pass/40 bg-pass/10"
          }`}>
            {previewBand.toUpperCase()}
          </div>
        </div>
      </div>

      {err && <div className="text-risk text-sm mb-3">{err}</div>}
      {saved && <div className="text-pass text-sm mb-3">Saved.</div>}
      <button className="btn-primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}
