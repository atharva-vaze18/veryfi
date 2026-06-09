"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BandBadge, RiskMeter, SignalRow } from "@/components/ui";
import type { Signal } from "@/lib/score";

interface Detail {
  candidateName: string; candidateEmail: string; roleContext: string; declaredCountry: string;
  status: string; candidateLink: string; riskScore: number | null; band: string | null; verdict: string | null;
  confidencePct: number | null; idv: { status: string | null; provider: string | null; livenessPassed: boolean | null };
  observedCountry: string | null; signals: Signal[]; createdAt: string; completedAt: string | null;
}

export default function ResultPage() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);

  // Live: poll so a pending verification flips to its result automatically.
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
  if (!d) return <p className="text-muted text-sm">Loading…</p>;

  if (d.status !== "complete") {
    return (
      <div className="max-w-xl">
        <Link href="/dashboard" className="text-muted hover:text-accent text-sm mb-4 inline-block">← Verifications</Link>
        <h1 className="font-display text-2xl text-ink mb-1">{d.candidateName}</h1>
        <p className="text-muted text-sm mb-6">Awaiting the candidate. Share the link below — results appear here once they complete the check.</p>
        <div className="panel p-5 space-y-3">
          <div className="label">Candidate link · status: {d.status}</div>
          <code className="block font-mono text-xs bg-paper-3 border border-rule px-3 py-2 rounded break-all text-ink-2">{d.candidateLink}</code>
          <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(d.candidateLink)}>Copy link</button>
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
    </div>
  );
}
