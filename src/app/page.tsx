"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OrbytMark } from "@/components/ui";

const FEATURES = [
  ["Relay & VPN detection", "Catch candidates who claim one country but connect via a datacenter, VPN, or proxy from another — the remote-impersonation playbook."],
  ["Virtual-camera & deepfake vectors", "Flag OBS / virtual cameras that inject pre-rendered or deepfaked video into the interview."],
  ["1:1 ID + liveness", "Confirm the person is real and present — government ID matched to a live selfie, with a static-photo check."],
  ["Fraud signals, not a background check", "No SSN, no records, no consumer report. You get a risk score; you make the call."],
];

export default function Landing() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@orbyt.test");
  const [password, setPassword] = useState("verify-demo-1234");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => { if (r.ok) router.replace("/dashboard"); });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Login failed");
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
            <div className="font-display font-semibold text-2xl text-ink">Orbyt <span className="text-muted font-normal">Verify</span></div>
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
          <h2 className="font-display text-2xl mb-1 text-ink">Sign in</h2>
          <p className="text-muted text-sm mb-7">Recruiter / security console.</p>
          <form onSubmit={submit} className="space-y-3">
            <div><label className="label block mb-1">Email</label>
              <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
            <div><label className="label block mb-1">Password</label>
              <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
            {err && <div className="text-risk text-xs border border-risk/30 bg-risk/5 px-3 py-2 rounded">{err}</div>}
            <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <div className="mt-6 label">Demo account is pre-filled · run <span className="text-ink-3">npm run db:seed</span></div>
        </div>
      </div>
    </div>
  );
}
