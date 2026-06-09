"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { OrbytMark } from "@/components/ui";
import { collectPassiveSignals, collectCameraSignals } from "@/lib/signals";
import { runLivenessChallenge } from "@/lib/liveness";
import { startCollecting } from "@/lib/behavioralCollector";

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
  const stopBehavioralRef = useRef<(() => ReturnType<typeof startCollecting>) | null>(null);

  useEffect(() => {
    const stop = startCollecting();
    stopBehavioralRef.current = stop as unknown as (() => ReturnType<typeof startCollecting>);
  }, []);

  if (data.complete) return <Done id={data.id} />;
  const nextConsent = data.consents.find((c: any) => !c.signed);
  if (nextConsent) return <ConsentStep key={nextConsent.type} token={token} doc={nextConsent} reload={reload} />;
  return <VerifyStep token={token} data={data} reload={reload} stopBehavioral={stopBehavioralRef.current} />;
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
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && agreed && name.trim().length >= 2 && !busy) sign(); }}
          placeholder="Full legal name"
        /></div>
      {err && <div className="text-risk text-xs mt-2">{err}</div>}
      <button className="btn-primary w-full mt-4" disabled={!agreed || name.trim().length < 2 || busy} onClick={sign}>{busy ? "Recording…" : "Agree & continue"}</button>
      <p className="text-[11px] text-muted mt-3 text-center">Your consent, timestamp and IP are recorded.</p>
    </div>
  );
}

function VerifyStep({ token, data, reload, stopBehavioral }: { token: string; data: any; reload: () => void; stopBehavioral: any }) {
  const params = useSearchParams();
  const returned = params.get("idv") === "return";
  const needsIdv = data.idvEnabled && !returned && !data.idvStatus;
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [idvUrl, setIdvUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const onCameraStep = !result && !needsIdv;

  // While the embedded ID flow is open, poll for completion and advance.
  useEffect(() => {
    if (!idvUrl) return;
    const iv = setInterval(async () => {
      try {
        const j = await (await fetch(`/api/candidate/${token}/idv`)).json();
        if (j.done) { clearInterval(iv); reload(); }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(iv);
  }, [idvUrl, token, reload]);

  // Keep a live camera preview running the whole time we're on the camera step
  // (so the candidate always sees their face, including during the slow analysis).
  useEffect(() => {
    if (!onCameraStep) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play().catch(() => {}); }
      } catch { /* permission prompt declined; Start will retry */ }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onCameraStep]);

  async function startIdv() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/candidate/${token}/idv`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      if (j.url) { setIdvUrl(j.url); return; } // embed in-page instead of redirecting
      reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function runCheck() {
    setErr(null);
    const sessionFrames: string[] = [];
    try {
      if (!streamRef.current) {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
      }
      const video = videoRef.current;
      if (!video) throw new Error("Camera not available");
      setPhase("running");

      // Capture a frame at challenge start (Feature 6).
      const captureFrame = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 320; canvas.height = 240;
          const ctx = canvas.getContext("2d");
          if (ctx) { ctx.drawImage(video, 0, 0, 320, 240); sessionFrames.push(canvas.toDataURL("image/jpeg", 0.75)); }
        } catch { /* ignore */ }
      };
      captureFrame();

      // 1. On-device challenge-response liveness — capture a frame at each challenge moment.
      const challenge = await runLivenessChallenge(video, (p) => {
        if (p) captureFrame();
        setPrompt(p);
      });

      // Capture final frame at completion.
      captureFrame();

      // 2. Collect behavioral signals (Feature 5).
      const behavioral = typeof stopBehavioral === "function" ? stopBehavioral() : null;

      // 3. Capture frame + device/connection signals.
      const passive = await collectPassiveSignals();
      const camera = await collectCameraSignals(video);
      const { faceImage, ...cam } = camera;
      const clientSignals = {
        ...passive,
        ...cam,
        challenge: {
          ran: challenge.ran,
          passed: challenge.passed,
          challengesPassed: challenge.challengesPassed,
          challengesTotal: challenge.challengesTotal,
          multipleFaces: challenge.multipleFaces,
          faceWasPresent: challenge.faceWasPresent,
          avgResponseMs: challenge.avgResponseMs,
          anomalies: challenge.anomalies,
        },
        behavioral,
      };
      const r = await fetch(`/api/candidate/${token}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientSignals, faceImage, sessionFrames }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      setResult(j);
    } catch (e) { setErr((e as Error).message); setPhase("idle"); }
  }


  if (result) return <Done id={data.id} />;

  if (needsIdv) {
    return (
      <div className="animate-fade-up">
        <div className="label mb-1">Identity</div>
        <h1 className="font-display text-2xl text-ink mb-3">Verify your identity</h1>
        <p className="text-sm text-muted mb-4">A quick 1:1 check — your government ID matched to a live selfie. Verification only, never a 1:many search.</p>
        {idvUrl ? (
          <div className="panel p-2 overflow-hidden">
            <iframe
              src={idvUrl}
              title="Identity verification"
              allow="camera; microphone; fullscreen; autoplay; encrypted-media"
              className="w-full rounded-md bg-white"
              style={{ height: 560, border: "none" }}
            />
            <div className="flex items-center justify-between px-2 py-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" /> Waiting for you to finish…
              </span>
              <button className="btn-ghost text-xs py-1.5" onClick={reload}>I&rsquo;ve finished →</button>
            </div>
          </div>
        ) : (
          <div className="panel p-6 text-center">
            <div className="text-5xl mb-3">🪪</div>
            {err && <div className="text-risk text-xs mb-3">{err}</div>}
            <button className="btn-primary w-full" disabled={busy} onClick={startIdv}>{busy ? "Starting…" : "Verify ID"}</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="label mb-1">Live check</div>
      <h1 className="font-display text-2xl text-ink mb-3">Quick camera check</h1>
      <p className="text-sm text-muted mb-4">We&rsquo;ll ask you to do a couple of quick actions on camera (like turning your head or blinking) to confirm you&rsquo;re a real, present person, and check your connection for impersonation signals. The liveness check runs in your browser — the video isn&rsquo;t stored.</p>
      <div className="panel p-5">
        {/* live camera preview — always visible on this step */}
        <div className="relative mx-auto mb-4 w-full max-w-[300px] aspect-[4/3] overflow-hidden rounded-lg border border-rule bg-paper-3">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          {/* big challenge prompt overlay */}
          {phase === "running" && prompt && (
            <div className="absolute inset-0 flex items-center justify-center bg-paper/55 backdrop-blur-[1px] p-3">
              <span className="font-display text-lg text-ink text-center leading-snug drop-shadow">{prompt}</span>
            </div>
          )}
          {phase === "running" && !prompt && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-paper/80 px-2.5 py-1 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-risk animate-pulse" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink">analyzing</span>
            </div>
          )}
        </div>
        {phase === "running" ? (
          <div className="text-center">
            <div className="mx-auto h-7 w-7 rounded-full border-2 border-accent border-t-transparent animate-spin mb-2" />
            <p className="text-sm text-ink">{prompt ? "Follow the on-screen prompt…" : "Checking connection & running deepfake analysis…"}</p>
            <p className="text-xs text-muted mt-1">Keep your face in view. This can take up to a minute — please don&rsquo;t close the window.</p>
          </div>
        ) : (
          <div className="text-center">
            {err && <div className="text-risk text-xs mb-3">{err}</div>}
            <button className="btn-primary w-full" onClick={runCheck}>Start check</button>
            <p className="text-[11px] text-muted mt-2">You should see your camera above. Click to run the one-time check.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Done({ id }: { id?: string }) {
  return (
    <div className="animate-fade-up text-center py-8">
      <div className="text-5xl mb-4">✓</div>
      <h1 className="font-display text-2xl text-ink mb-2">All done</h1>
      <p className="text-sm text-muted">Thanks — your verification is complete. You can close this window. The hiring team will follow up.</p>
      {id && (
        <a href={`/verify/${id}`} className="inline-block mt-6 btn-ghost text-xs">View result (recruiter) →</a>
      )}
    </div>
  );
}
