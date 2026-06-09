"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";

interface ApiKey {
  id: string;
  keyPrefix: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  enabled: boolean;
}

export default function ApiKeysPage() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newName, setNewName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const r = await fetch("/api/keys");
    if (r.ok) setKeys((await r.json()).keys);
  }

  useEffect(() => { load(); }, []);

  async function generate() {
    setGenerating(true); setErr(null); setRevealedKey(null);
    try {
      const r = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j.error));
      setRevealedKey(j.key);
      setNewName("");
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setGenerating(false); }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this API key? Any integrations using it will stop working.")) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    await load();
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="mb-6">
        <div className="text-muted text-sm mb-1">
          <Link href="/dashboard" className="hover:text-accent">Dashboard</Link>
          {" → "}Settings → API Keys
        </div>
        <h1 className="font-display text-3xl text-ink">API Keys</h1>
        <p className="text-muted text-sm mt-1">Programmatically create and retrieve verifications via the REST API.</p>
      </div>

      {/* Generate key form */}
      <div className="panel p-5 mb-6">
        <div className="label mb-3">Generate new key</div>
        <div className="flex gap-3">
          <input
            className="field flex-1"
            placeholder="Key label, e.g. Production integration"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newName.trim() && !generating) generate(); }}
          />
          <button className="btn-primary shrink-0" disabled={generating || !newName.trim()} onClick={generate}>
            {generating ? "Generating…" : "Generate"}
          </button>
        </div>
        {err && <div className="text-risk text-xs mt-2">{err}</div>}
      </div>

      {/* One-time key reveal modal */}
      {revealedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRevealedKey(null)} />
          <div className="relative bg-paper border border-rule rounded-xl p-6 max-w-lg w-full shadow-2xl">
            <h2 className="font-display text-xl text-ink mb-2">Your new API key</h2>
            <p className="text-sm text-risk mb-4">This key is shown once and will not be displayed again. Copy it now and store it securely.</p>
            <div className="bg-paper-3 border border-rule rounded p-3 font-mono text-sm break-all text-ink-2 mb-4">
              {revealedKey}
            </div>
            <div className="flex gap-3">
              <button className="btn-primary flex-1" onClick={() => copy(revealedKey)}>
                {copied ? "Copied!" : "Copy key"}
              </button>
              <button className="btn-ghost" onClick={() => setRevealedKey(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Key list */}
      {keys.length === 0 ? (
        <div className="panel p-8 text-center text-muted text-sm">No API keys yet. Generate one above.</div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="px-5 py-3 border-b border-rule label">Active keys ({keys.filter((k) => k.enabled).length})</div>
          {keys.map((k) => (
            <div key={k.id} className="px-5 py-4 border-b border-rule/60 last:border-0 flex items-center justify-between gap-4">
              <div>
                <div className="text-ink text-sm font-medium">{k.name}</div>
                <div className="text-xs text-muted mt-0.5 font-mono">{k.keyPrefix}… · created {new Date(k.createdAt).toLocaleDateString()}</div>
                {k.lastUsedAt && <div className="text-xs text-muted">last used {new Date(k.lastUsedAt).toLocaleString()}</div>}
              </div>
              <div className="flex items-center gap-3">
                {k.enabled ? (
                  <span className="text-pass text-xs">active</span>
                ) : (
                  <span className="text-risk text-xs">revoked</span>
                )}
                {k.enabled && (
                  <button onClick={() => revoke(k.id)} className="text-muted hover:text-risk text-sm">Revoke</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 panel p-5">
        <div className="label mb-2">API reference</div>
        <div className="text-sm text-muted space-y-1">
          <div><code className="font-mono text-xs bg-paper-3 px-1 rounded">POST /api/v1/verifications</code> — create a verification</div>
          <div><code className="font-mono text-xs bg-paper-3 px-1 rounded">GET /api/v1/verifications/:id</code> — get result</div>
          <div><code className="font-mono text-xs bg-paper-3 px-1 rounded">GET /api/v1/verifications</code> — list (paginated)</div>
        </div>
        <div className="text-xs text-muted mt-2">Authenticate with <code className="font-mono bg-paper-3 px-1 rounded">Authorization: Bearer vfy_live_...</code></div>
      </div>
    </div>
  );
}
