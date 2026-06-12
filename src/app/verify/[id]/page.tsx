"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BandBadge, RiskMeter, SignalRow } from "@/components/ui";
import type { Signal } from "@/lib/score";

interface FrameUrl { key: string; url: string | null }

interface Detail {
  candidateName: string; candidateEmail: string; roleContext: string; declaredCountry: string;
  status: string; candidateLink: string; linkState: "active" | "expired" | "revoked"; expiresAt: string | null;
  riskScore: number | null; band: string | null; verdict: string | null;
  confidencePct: number | null; idv: { status: string | null; provider: string | null; livenessPassed: boolean | null };
  observedCountry: string | null; signals: Signal[];
  frameStorageKeys: string[];
  reviewDecision: string | null;
  reviewNotes: string | null;
  createdAt: string; completedAt: string | null;
}

export default function ResultPage() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [frames, setFrames] = useState<FrameUrl[]>([]);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const j = await (await fetch(`/api/verifications/${id}`)).json(); if (active) setD(j); } catch { /* keep polling */ }
    };
    load();
    const iv = setInterval(() => { if (!document.hidden) load(); }, 5000);
    window.addEventListener("focus", load);
    return () => { active = false; clearInterval(iv); window.removeEventListener("focus", load); };
  }, [id]);

  useEffect(() => {
    if (d?.band === "review" && d.frameStorageKeys.length > 0) {
      fetch(`/api/verifications/${id}/frames`).then(async (r) => {
        if (r.ok) setFrames((await r.json()).urls);
      });
    }
  }, [d?.band, d?.frameStorageKeys.length, id]);

  async function submitReview(decision: "cleared" | "confirmed_fraud") {
    setSubmittingReview(true);
    try {
      await fetch(`/api/verifications/${id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewDecision: decision, reviewNotes }),
      });
      const j = await (await fetch(`/api/verifications/${id}`)).json();
      setD(j);
    } finally { setSubmittingReview(false); }
  }

  async function linkAction(action: "revoke" | "regenerate") {
    const r = await fetch(`/api/verifications/${id}/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (r.ok) {
      const j = await (await fetch(`/api/verifications/${id}`)).json();
      setD(j);
    }
  }

  if (!d) return <p className="text-muted text-sm">Loading…</p>;

  if (d.status !== "complete") {
    const dead = d.linkState !== "active";
    return (
      <div className="max-w-xl">
        <Link href="/dashboard" className="text-muted hover:text-accent text-sm mb-4 inline-block">← Verifications</Link>
        <h1 className="font-display text-2xl text-ink mb-1">{d.candidateName}</h1>
        <p className="text-muted text-sm mb-6">Awaiting the candidate. Share the link below — results appear here once they complete the check.</p>
        <div className="panel p-5 space-y-3">
          <div className="label">
            Candidate link · status: {d.status}
            {d.linkState === "revoked" && <span className="text-risk"> · revoked</span>}
            {d.linkState === "expired" && <span className="text-risk"> · expired</span>}
            {d.linkState === "active" && d.expiresAt && <span> · expires {new Date(d.expiresAt).toLocaleDateString()}</span>}
          </div>
          {!dead && (
            <code className="block font-mono text-xs bg-paper-3 border border-rule px-3 py-2 rounded break-all text-ink-2">{d.candidateLink}</code>
          )}
          <div className="flex items-center gap-2">
            {!dead && <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(d.candidateLink)}>Copy link</button>}
            {!dead && <button className="btn-ghost text-risk" onClick={() => linkAction("revoke")}>Revoke link</button>}
            <button className="btn-ghost" onClick={() => linkAction("regenerate")}>{dead ? "Issue new link" : "Regenerate link"}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/dashboard" className="text-muted hover:text-accent text-sm mb-4 inline-block">← Verifications</Link>
      <div className="flex items-start justify-between gap-4 mb-6 pb-5 border-b border-rule">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl text-ink">{d.candidateName}</h1>
            <BandBadge band={d.band} />
          </div>
          <div className="text-muted text-sm mt-1">{d.candidateEmail} · {d.roleContext || "—"}</div>
        </div>
        <div className="text-right text-xs text-muted">
          <div>declared {d.declaredCountry || "—"} · observed {d.observedCountry || "—"}</div>
          <div>signal confidence {d.confidencePct ?? 0}%</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-6">
        <div className="space-y-4">
          <div className="panel p-5">
            <div className="label mb-3">Verdict</div>
            <RiskMeter score={d.riskScore ?? 0} band={d.band ?? "review"} />
            <p className="text-sm text-ink mt-3">{d.verdict}</p>
            <p className="text-xs text-muted mt-2">Higher = more likely fake/impersonated. This is a fraud signal — your team makes the hiring decision.</p>
          </div>
          <div className="panel p-5">
            <div className="label mb-2">ID verification</div>
            <div className="text-sm text-ink">{d.idv.provider === "none" ? "Not configured" : d.idv.provider}</div>
            <div className="text-xs text-muted mt-1">status: {d.idv.status} {d.idv.livenessPassed != null ? `· liveness ${d.idv.livenessPassed ? "passed" : "failed"}` : ""}</div>
          </div>
        </div>

        <div className="panel p-5">
          <div className="label mb-2">Signal breakdown</div>
          <div className="-my-1">
            {d.signals.map((s) => <SignalRow key={s.key} s={s} />)}
          </div>
          <p className="text-xs text-muted mt-4 pt-3 border-t border-rule">
            Signals marked <span className="text-muted">not evaluated</span> need an API key (IPQualityScore, Stripe Identity, Reality Defender). They never affect the score until configured.
          </p>
        </div>
      </div>

      {/* Feature 6: Session replay for "review" band */}
      {d.band === "review" && (
        <div className="mt-6 panel p-5">
          <div className="label mb-3">Review session</div>

          {frames.length > 0 ? (
            <div>
              <p className="text-xs text-muted mb-3">Captured frames from the liveness challenge. Stored for 30 days.</p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {frames.map((f, i) => (
                  <div key={f.key} className="shrink-0">
                    {f.url ? (
                      <img src={f.url} alt={`Frame ${i + 1}`} className="w-32 h-24 object-cover rounded border border-rule" />
                    ) : (
                      <div className="w-32 h-24 flex items-center justify-center bg-paper-3 rounded border border-rule text-xs text-muted">no URL</div>
                    )}
                    <div className="text-[10px] text-muted text-center mt-1">frame {i + 1}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted mb-3">No session frames captured for this verification.</p>
          )}

          <div className="mt-4 border-t border-rule/60 pt-4">
            <div className="label mb-2">Signal timeline</div>
            <div className="flex flex-wrap gap-2 mb-4">
              {d.signals.filter((s) => s.evaluated).map((s, i) => (
                <span key={s.key} className={`text-[11px] font-mono px-2 py-0.5 rounded border ${s.triggered ? "border-risk/40 text-risk bg-risk/5" : "border-pass/30 text-pass bg-pass/5"}`}>
                  {i + 1}. {s.key}
                </span>
              ))}
            </div>

            {d.reviewDecision ? (
              <div className={`p-3 rounded border text-sm ${d.reviewDecision === "cleared" ? "border-pass/40 bg-pass/10 text-pass" : "border-risk/40 bg-risk/10 text-risk"}`}>
                Decision: <strong>{d.reviewDecision === "cleared" ? "Cleared" : "Confirmed fraud"}</strong>
                {d.reviewNotes && <div className="text-xs mt-1 text-muted">{d.reviewNotes}</div>}
              </div>
            ) : (
              <div>
                <div className="label mb-1">Recruiter notes</div>
                <textarea
                  className="field w-full mb-3"
                  rows={3}
                  placeholder="Add your review notes…"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                />
                <div className="flex gap-3">
                  <button
                    className="px-4 py-2 text-sm rounded border border-pass/40 bg-pass/10 text-pass hover:bg-pass/20 transition-colors disabled:opacity-50"
                    disabled={submittingReview}
                    onClick={() => submitReview("cleared")}
                  >
                    Mark as cleared
                  </button>
                  <button
                    className="px-4 py-2 text-sm rounded border border-risk/40 bg-risk/10 text-risk hover:bg-risk/20 transition-colors disabled:opacity-50"
                    disabled={submittingReview}
                    onClick={() => submitReview("confirmed_fraud")}
                  >
                    Confirm fraud
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
