"use client";
import { useState } from "react";
import Link from "next/link";
import { OrbytMark } from "@/components/ui";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Something went wrong");
      setEmailConfigured(j.emailConfigured !== false);
      setSent(true);
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="relative z-10 min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 mb-8"><OrbytMark size={32} /><span className="font-display font-semibold text-xl text-ink">Orbyt <span className="text-muted font-normal">Verify</span></span></Link>
        {sent ? (
          <div className="panel p-5">
            <h1 className="font-display text-xl text-ink mb-2">Check your email</h1>
            <p className="text-sm text-muted">If an account exists for <span className="text-ink">{email}</span>, we&apos;ve sent a password-reset link. It&apos;s valid for one hour.</p>
            {!emailConfigured && (
              <p className="text-xs text-review mt-3 border-l-2 border-review pl-2">Note: email delivery isn&apos;t configured on this deployment yet (set <span className="font-mono">RESEND_API_KEY</span>), so no email was actually sent. An admin can reset your password from the Team page in the meantime.</p>
            )}
            <Link href="/" className="btn-ghost w-full text-center mt-5">← Back to sign in</Link>
          </div>
        ) : (
          <div className="panel p-5">
            <h1 className="font-display text-xl text-ink mb-1">Forgot your password?</h1>
            <p className="text-sm text-muted mb-5">Enter your email and we&apos;ll send a reset link.</p>
            <form onSubmit={submit} className="space-y-3">
              <input className="field" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              {err && <div className="text-risk text-xs">{err}</div>}
              <button className="btn-primary w-full" disabled={busy || !email}>{busy ? "Sending…" : "Send reset link"}</button>
            </form>
            <Link href="/" className="block text-center text-xs text-muted hover:text-accent mt-5">← Back to sign in</Link>
          </div>
        )}
      </div>
    </div>
  );
}
