"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OrbytMark } from "@/components/ui";

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="p-10 text-muted text-sm">Loading…</div>}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not reset password");
      setDone(true);
      setTimeout(() => router.replace("/"), 1800);
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="relative z-10 min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 mb-8"><OrbytMark size={32} /><span className="font-display font-semibold text-xl text-ink">Orbyt <span className="text-muted font-normal">Verify</span></span></Link>
        <div className="panel p-5">
          {!token ? (
            <>
              <h1 className="font-display text-xl text-ink mb-2">Invalid link</h1>
              <p className="text-sm text-muted">This reset link is missing its token. Request a new one.</p>
              <Link href="/forgot" className="btn-ghost w-full text-center mt-5">Request a new link</Link>
            </>
          ) : done ? (
            <>
              <h1 className="font-display text-xl text-ink mb-2">Password updated ✓</h1>
              <p className="text-sm text-muted">Redirecting you to sign in…</p>
            </>
          ) : (
            <>
              <h1 className="font-display text-xl text-ink mb-1">Set a new password</h1>
              <p className="text-sm text-muted mb-5">Choose a strong password (8+ characters).</p>
              <form onSubmit={submit} className="space-y-3">
                <input className="field" type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <input className="field" type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
                {err && <div className="text-risk text-xs">{err}</div>}
                <button className="btn-primary w-full" disabled={busy || password.length < 8}>{busy ? "Updating…" : "Update password"}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
