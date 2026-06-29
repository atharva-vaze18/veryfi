"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OrbytMark } from "@/components/ui";

const FEATURES = [
  ["Relay & VPN detection", "Catch candidates who claim one country but connect via a datacenter, VPN, or proxy from another — the remote-impersonation playbook."],
  ["Virtual-camera & deepfake vectors", "Flag OBS / virtual cameras that inject pre-rendered or deepfaked video into the interview."],
  ["1:1 ID + liveness", "Confirm the person is real and present — government ID matched to a live selfie, with a static-photo check."],
  ["Fraud signals, not a background check", "No SSN, no records, no consumer report. You get a risk score; you make the call."],
];

type Mode = "signin" | "signup";

function AuthInner() {
  const router = useRouter();
  const search = useSearchParams();
  const initialMode: Mode = search.get("mode") === "signup" ? "signup" : "signin";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfaPending, setMfaPending] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    fetch("/api/auth/me").then((r) => { if (r.ok) router.replace("/dashboard"); });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body = mode === "signup" ? { orgName, name, email, password } : { email, password };
      const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? (mode === "signup" ? "Sign up failed" : "Login failed"));
      if (j.mfaRequired) { setMfaPending(true); return; }
      router.replace("/dashboard");
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  async function submitMfa(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/auth/mfa/challenge", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: mfaCode.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error === "invalid_code" ? "That code didn't match — try the next one." : (j.error ?? "MFA challenge failed"));
      router.replace("/dashboard");
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="relative z-10 min-h-screen grid lg:grid-cols-[1.15fr_0.85fr]">
      <div className="relative overflow-hidden px-8 lg:px-14 py-12 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-rule">
        <div aria-hidden className="pointer-events-none absolute -top-28 -left-24 h-[460px] w-[460px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(77,141,255,0.22), transparent 60%)" }} />
        <div className="relative flex items-center gap-3">
          <OrbytMark size={42} />
          <div className="leading-tight">
            <div className="font-display font-semibold text-2xl text-ink">Veryfi</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent/80 mt-1">Navigate Compliance. Accelerate Growth.</div>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="label text-muted mb-4">Interview-integrity · anti-impersonation</p>
          <h1 className="font-display text-[2.5rem] leading-[1.07] text-ink">
            Catch <span className="text-accent">fake remote candidates</span> before you hire them.
          </h1>
          <p className="mt-5 text-ink-2 text-[15px] leading-relaxed">
            A 60-second consent-based check that detects deepfake injection, VPN/relay, impersonation, and
            non-present candidates — the North-Korean-fake-worker problem. Real fraud signals; you decide.
          </p>
          <div className="mt-9 grid sm:grid-cols-2 gap-x-8 gap-y-5">
            {FEATURES.map(([t, d]) => (
              <div key={t}>
                <div className="font-display text-[15px] mb-1 text-ink">{t}</div>
                <div className="text-muted text-[13px] leading-snug">{d}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-muted text-xs max-w-lg leading-relaxed">
          Identity-assurance &amp; fraud detection — not a consumer report. No SSN, criminal, employment, or credit
          data. Signals are real and only reflect what was measured.
        </p>
      </div>

      <div className="px-8 lg:px-12 py-12 flex items-center">
        <div className="w-full max-w-sm mx-auto">
          <div className="flex gap-1 p-1 rounded-lg bg-paper-3 border border-rule mb-6 text-sm">
            <button type="button" onClick={() => { setMode("signin"); setErr(null); }}
              className={`flex-1 py-1.5 rounded-md transition-colors ${mode === "signin" ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"}`}>Sign in</button>
            <button type="button" onClick={() => { setMode("signup"); setErr(null); }}
              className={`flex-1 py-1.5 rounded-md transition-colors ${mode === "signup" ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"}`}>Create account</button>
          </div>
          <h2 className="font-display text-2xl mb-1 text-ink">{mfaPending ? "Two-factor required" : mode === "signup" ? "Start verifying" : "Welcome back"}</h2>
          <p className="text-muted text-sm mb-7">{mfaPending ? "Enter the 6-digit code from your authenticator app — or a backup code." : mode === "signup" ? "Free plan — 25 verifications/month, no card required." : "Recruiter / security console."}</p>
          {mfaPending ? (
            <form onSubmit={submitMfa} className="space-y-3">
              <div><label className="label block mb-1">Authenticator code</label>
                <input className="field" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} autoFocus placeholder="123456" autoComplete="one-time-code" /></div>
              {err && <div className="text-risk text-xs border border-risk/30 bg-risk/5 px-3 py-2 rounded">{err}</div>}
              <button className="btn-primary w-full" disabled={busy || mfaCode.length < 6}>{busy ? "Verifying…" : "Sign in →"}</button>
            </form>
          ) : (
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <>
                <div><label className="label block mb-1">Company</label>
                  <input className="field" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Inc." autoComplete="organization" /></div>
                <div><label className="label block mb-1">Your name</label>
                  <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Lee" autoComplete="name" /></div>
              </>
            )}
            <div><label className="label block mb-1">Work email</label>
              <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={mode === "signup" ? "email" : "username"} /></div>
            <div><label className="label block mb-1">Password</label>
              <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "8+ characters" : ""} /></div>
            {err && <div className="text-risk text-xs border border-risk/30 bg-risk/5 px-3 py-2 rounded">{err}</div>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account →" : "Sign in"}</button>
          </form>
          )}
          {!mfaPending && mode === "signin" && (
            <div className="mt-3 text-right"><Link href="/forgot" className="text-xs text-muted hover:text-accent">Forgot password?</Link></div>
          )}
          {!mfaPending && (
          <div className="mt-6 text-xs text-muted">
            {mode === "signup"
              ? <>Already have an account? <button onClick={() => setMode("signin")} className="text-accent">Sign in</button></>
              : <>New here? <button onClick={() => setMode("signup")} className="text-accent">Create an account</button></>}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

// useSearchParams() must sit under a Suspense boundary, otherwise Next 14 fails
// to statically prerender /auth and the whole production build errors out.
export default function AuthPage() {
  return (
    <Suspense fallback={<div className="p-10 text-muted text-sm">Loading…</div>}>
      <AuthInner />
    </Suspense>
  );
}
