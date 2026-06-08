"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function NewVerification() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [f, setF] = useState({ candidateName: "", candidateEmail: "", roleContext: "", declaredCountry: "US" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ candidateLink: string; id: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/verifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      if (!r.ok) throw new Error("Could not create verification");
      setResult(await r.json());
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  if (result) {
    return (
      <div className="max-w-xl">
        <h1 className="font-display text-3xl text-ink mb-2">Verification created</h1>
        <p className="text-muted text-sm mb-6">Send the candidate this private link. The check runs only after they consent — no data is collected until then.</p>
        <div className="panel p-5 space-y-3">
          <div className="label">Candidate link</div>
          <code className="block font-mono text-xs bg-paper-3 border border-rule px-3 py-2 rounded break-all text-ink-2">{result.candidateLink}</code>
          <div className="flex gap-2 flex-wrap pt-1">
            <a href={result.candidateLink} target="_blank" rel="noreferrer" className="btn-primary">Open candidate flow →</a>
            <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(result.candidateLink)}>Copy link</button>
            <Link href={`/verify/${result.id}`} className="btn-ghost">View result</Link>
          </div>
        </div>
        <p className="text-muted text-xs mt-4">Tip: paste this into your interview invite, or have the candidate complete it at the start of the call.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-3xl text-ink mb-1">New verification</h1>
      <p className="text-muted text-sm mb-7">Just a name, work email, and the country they claim to be in. No SSN or records.</p>
      <form onSubmit={submit} className="panel p-5 space-y-4">
        <div><label className="label block mb-1">Candidate name</label><input className="field" required value={f.candidateName} onChange={set("candidateName")} /></div>
        <div><label className="label block mb-1">Candidate email</label><input className="field" type="email" required value={f.candidateEmail} onChange={set("candidateEmail")} /></div>
        <div><label className="label block mb-1">Role / context (optional)</label><input className="field" placeholder="Senior Backend Engineer — remote contractor" value={f.roleContext} onChange={set("roleContext")} /></div>
        <div><label className="label block mb-1">Declared country (ISO-2)</label><input className="field max-w-[140px]" value={f.declaredCountry} onChange={set("declaredCountry")} maxLength={2} /></div>
        {err && <div className="text-risk text-xs border border-risk/30 bg-risk/5 px-3 py-2 rounded">{err}</div>}
        <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create & generate link"}</button>
      </form>
    </div>
  );
}
