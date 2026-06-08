"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { OrbytMark } from "@/components/ui";
import { collectPassiveSignals, collectCameraSignals } from "@/lib/signals";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function CandidateFlow() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/candidate/${token}`);
    if (!r.ok) { setErr((await r.json()).error ?? "Invalid link"); return; }
    setData(await r.json());
  }, [token]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <header className="border-b border-rule">
        <div className="max-w-md mx-auto px-5 h-14 flex items-center justify-between">
          <span className="inline-flex items-center gap-2"><OrbytMark size={22} /><span className="font-display font-semibold text-ink">Orbyt <span className="text-muted font-normal">Verify</span></span></span>
          <span className="label">Candidate check</span>
        </div>
      </header>
      <div className="flex-1 max-w-md w-full mx-auto px-5 py-8">
        {err ? <div className="panel p-5 text-risk text-sm">{err}</div>
          : !data ? <p className="text-muted text-sm">Loading…</p>
          : <Flow token={token} data={data} reload={load} />}
      </div>
    </div>
  );
}

function Flow({ token, data, reload }: { token: string; data: any; reload: () => void }) {
  if (data.complete) return <Done />;
  const nextConsent = data.consents.find((c: any) => !c.signed);
  if (nextConsent) return <ConsentStep key={nextConsent.type} token={token} doc={nextConsent} reload={reload} />;
  return <VerifyStep token={token} data={data} reload={reload} />;
}

function ConsentStep({ token, doc, reload }: { token: string; doc: any; reload: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bio = doc.type === "BIOMETRIC";

  async function sign() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/candidate/${token}/consent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: doc.type, version: doc.version, fullNameTyped: name, agreed: true }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="animate-fade-up">
      <div className="label mb-1">Consent</div>
      <h1 className="font-display text-2xl text-ink mb-3">{doc.title}</h1>
      <div className="panel p-4 text-sm leading-relaxed text-ink-2">{doc.body}</div>
      {doc.retentionPolicy && (
        <div className="mt-3 border-l-2 border-accent bg-accent/5 pl-3 py-2.5 rounded-r">
          <div className="label text-accent mb-1">Retention &amp; deletion</div>
          <p className="text-xs text-ink-2 leading-relaxed">{doc.retentionPolicy}</p>
        </div>
      )}
      <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 accent-[#4d8dff]" />
        <span className="text-sm text-ink-2">I have read and {bio ? "provide my written consent to" : "agree to"} the above.</span>
      </label>
      <div className="mt-3"><label className="label block mb-1">Type your full name to sign</label>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full legal name" /></div>
      {err && <div className="text-risk text-xs mt-2">{err}</div>}
      <button className="btn-primary w-full mt-4" disabled={!agreed || name.trim().length < 2 || busy} onClick={sign}>{busy ? "Recording…" : "Agree & continue"}</button>
      <p className="text-[11px] text-muted mt-3 text-center">Your consent, timestamp and IP are recorded.</p>
    </div>
  );
}

function VerifyStep({ token, data, reload }: { token: string; data: any; reload: () => void }) {
  const params = useSearchParams();
  const returned = params.get("idv") === "return";
  const needsIdv = data.idvEnabled && !returned && !data.idvStatus;
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  async function startIdv() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/candidate/${token}/idv`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      if (j.url) { window.location.href = j.url; return; }
      reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function runCheck() {
    setPhase("running"); setErr(null);
    try {
      const passive = await collectPassiveSignals();
      const camera = await collectCameraSignals();
      const { faceImage, ...cam } = camera;
      const clientSignals = { ...passive, ...cam };
      const r = await fetch(`/api/candidate/${token}/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientSignals, faceImage }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      setResult(j);
    } catch (e) { setErr((e as Error).message); setPhase("idle"); }
  }

  if (result) return <Done />;

  if (needsIdv) {
    return (
      <div className="animate-fade-up">
        <div className="label mb-1">Identity</div>
        <h1 className="font-display text-2xl text-ink mb-3">Verify your identity</h1>
        <p className="text-sm text-muted mb-4">A quick 1:1 check — your government ID matched to a live selfie. Verification only, never a 1:many search.</p>
        <div className="panel p-6 text-center">
          <div className="text-5xl mb-3">🪪</div>
          {err && <div className="text-risk text-xs mb-3">{err}</div>}
          <button className="btn-primary w-full" disabled={busy} onClick={startIdv}>{busy ? "Starting…" : "Verify ID"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="label mb-1">Live check</div>
      <h1 className="font-display text-2xl text-ink mb-3">Quick camera check</h1>
      <p className="text-sm text-muted mb-4">We&rsquo;ll briefly access your camera to confirm a real, present person and check your connection for impersonation signals. ~10 seconds. Nothing is recorded or stored — only a pass/fail result.</p>
      <div className="panel p-6 text-center">
        {phase === "running" ? (
          <div className="py-4">
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin mb-3" />
            <p className="text-sm text-ink">Checking camera, connection &amp; running deepfake analysis…</p>
            <p className="text-xs text-muted mt-1">Allow camera access if prompted. This can take up to a minute — please don&rsquo;t close the window.</p>
          </div>
        ) : (
          <>
            <div className="text-5xl mb-3">🎥</div>
            {err && <div className="text-risk text-xs mb-3">{err}</div>}
            <button className="btn-primary w-full" onClick={runCheck}>Start check</button>
            <p className="text-[11px] text-muted mt-3">By continuing you allow a one-time camera + connection check.</p>
          </>
        )}
      </div>
    </div>
  );
}

function Done() {
  return (
    <div className="animate-fade-up text-center py-8">
      <div className="text-5xl mb-4">✓</div>
      <h1 className="font-display text-2xl text-ink mb-2">All done</h1>
      <p className="text-sm text-muted">Thanks — your verification is complete. You can close this window. The hiring team will follow up.</p>
    </div>
  );
}
