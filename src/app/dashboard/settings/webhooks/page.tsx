"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";

interface Endpoint {
  id: string;
  url: string;
  events: string;
  enabled: boolean;
  createdAt: string;
  lastDeliveredAt: string | null;
  deliveries: { success: boolean }[];
}

interface Delivery {
  id: string;
  event: string;
  responseStatus: number | null;
  responseBodySnippet: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  success: boolean;
  createdAt: string;
  verificationId: string;
}

const ALL_EVENTS = ["verification.completed", "verification.flagged"] as const;

export default function WebhooksPage() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["verification.completed"]);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [drawerEndpoint, setDrawerEndpoint] = useState<Endpoint | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  async function load() {
    const r = await fetch("/api/webhooks");
    if (r.ok) setEndpoints((await r.json()).endpoints);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    setAdding(true); setErr(null); setNewSecret(null);
    try {
      const r = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: newUrl, events: newEvents }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j.error));
      setNewSecret(j.secret);
      setNewUrl("");
      await load();
    } catch (e) { setErr((e as Error).message); } finally { setAdding(false); }
  }

  async function del(id: string) {
    if (!confirm("Delete this webhook endpoint?")) return;
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    await load();
  }

  async function openDrawer(ep: Endpoint) {
    setDrawerEndpoint(ep);
    const r = await fetch(`/api/webhooks/${ep.id}/deliveries`);
    if (r.ok) setDeliveries((await r.json()).deliveries);
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-muted text-sm mb-1">
            <Link href="/dashboard" className="hover:text-accent">Dashboard</Link>
            {" → "}Settings → Webhooks
          </div>
          <h1 className="font-display text-3xl text-ink">Webhooks</h1>
          <p className="text-muted text-sm mt-1">Receive POST notifications when verifications complete.</p>
        </div>
      </div>

      {/* Add endpoint form */}
      <div className="panel p-5 mb-6">
        <div className="label mb-3">Add endpoint</div>
        <div className="flex gap-3 mb-3">
          <input
            className="field flex-1"
            placeholder="https://your-app.com/webhooks/veryfi"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-3 mb-3">
          {ALL_EVENTS.map((ev) => (
            <label key={ev} className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={newEvents.includes(ev)}
                onChange={(e) => setNewEvents(e.target.checked ? [...newEvents, ev] : newEvents.filter((x) => x !== ev))}
                className="accent-[#4d8dff]"
              />
              <span className="font-mono text-xs">{ev}</span>
            </label>
          ))}
        </div>
        {err && <div className="text-risk text-xs mb-2">{err}</div>}
        {newSecret && (
          <div className="mb-3 p-3 bg-pass/10 border border-pass/30 rounded text-sm">
            <div className="font-display text-ink mb-1">Endpoint created — copy your signing secret</div>
            <code className="font-mono text-xs break-all text-ink-2">{newSecret}</code>
            <div className="text-xs text-muted mt-1">This secret is shown once. Store it securely — use it to verify the X-Veryfi-Signature header on incoming requests.</div>
          </div>
        )}
        <button className="btn-primary" disabled={adding || !newUrl || newEvents.length === 0} onClick={add}>
          {adding ? "Adding…" : "Add endpoint"}
        </button>
      </div>

      {/* Endpoint list */}
      {endpoints.length === 0 ? (
        <div className="panel p-8 text-center text-muted text-sm">No webhook endpoints configured.</div>
      ) : (
        <div className="panel overflow-hidden">
          <div className="px-5 py-3 border-b border-rule label">Endpoints ({endpoints.length})</div>
          {endpoints.map((ep) => {
            const events = (() => { try { return JSON.parse(ep.events) as string[]; } catch { return []; } })();
            return (
              <div key={ep.id} className="px-5 py-4 border-b border-rule/60 last:border-0 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-ink truncate">{ep.url}</div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {events.map((ev: string) => (
                      <span key={ev} className="font-mono text-[10px] px-2 py-0.5 bg-paper-3 rounded border border-rule text-muted">{ev}</span>
                    ))}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    {ep.enabled ? <span className="text-pass">enabled</span> : <span className="text-risk">disabled</span>}
                    {ep.lastDeliveredAt && ` · last delivery ${new Date(ep.lastDeliveredAt).toLocaleString()}`}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => openDrawer(ep)} className="text-accent text-sm hover:underline">Logs</button>
                  <button onClick={() => del(ep.id)} className="text-muted hover:text-risk text-sm">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delivery log drawer */}
      {drawerEndpoint && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerEndpoint(null)} />
          <div className="relative ml-auto w-full max-w-xl bg-paper h-full overflow-y-auto shadow-2xl p-6 animate-fade-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-ink">Delivery log</h2>
              <button onClick={() => setDrawerEndpoint(null)} className="text-muted hover:text-ink text-lg">✕</button>
            </div>
            <div className="font-mono text-xs text-muted mb-4 break-all">{drawerEndpoint.url}</div>
            {deliveries.length === 0 ? (
              <div className="text-muted text-sm">No deliveries yet.</div>
            ) : (
              <div className="space-y-2">
                {deliveries.map((d) => (
                  <div key={d.id} className={`rounded border p-3 ${d.success ? "border-pass/30 bg-pass/5" : "border-risk/30 bg-risk/5"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted">{d.event}</span>
                      <span className={`font-mono text-[11px] ${d.success ? "text-pass" : "text-risk"}`}>
                        {d.responseStatus ?? "—"} · {d.attemptCount} attempt{d.attemptCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {d.responseBodySnippet && (
                      <div className="mt-1 font-mono text-[10px] text-muted truncate">{d.responseBodySnippet}</div>
                    )}
                    <div className="text-[10px] text-muted mt-1">{new Date(d.createdAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
