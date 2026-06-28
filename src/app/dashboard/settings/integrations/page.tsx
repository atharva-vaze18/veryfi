"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Link from "next/link";

interface Stage { id: number | string; name?: string; text?: string }
interface GhConfig {
  configured: boolean;
  enabled?: boolean;
  harvestApiKeyPrefix?: string;
  triggerStageId?: string;
  jobIds?: string[];
  autoPostNote?: boolean;
}
interface LvConfig {
  configured: boolean;
  enabled?: boolean;
  apiKeyPrefix?: string;
  triggerStageId?: string;
  autoPostNote?: boolean;
}

type Tab = "greenhouse" | "lever";

export default function IntegrationsPage() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [tab, setTab] = useState<Tab>("greenhouse");
  const [gh, setGh] = useState<GhConfig>({ configured: false });
  const [lv, setLv] = useState<LvConfig>({ configured: false });

  useEffect(() => {
    fetch("/api/integrations/greenhouse").then(async (r) => { if (r.ok) setGh(await r.json()); });
    fetch("/api/integrations/lever").then(async (r) => { if (r.ok) setLv(await r.json()); });
  }, []);

  return (
    <div>
      <div className="mb-6">
        <div className="text-muted text-sm mb-1">
          <Link href="/dashboard" className="hover:text-accent">Dashboard</Link>
          {" → "}Settings → Integrations
        </div>
        <h1 className="font-display text-3xl text-ink">Integrations</h1>
        <p className="text-muted text-sm mt-1">Connect Veryfi to your ATS and automate fraud checks.</p>
      </div>

      {/* Integration cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <button onClick={() => setTab("greenhouse")} className={`panel p-5 text-left ${tab === "greenhouse" ? "ring-2 ring-accent/40" : ""}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-display text-lg text-ink">Greenhouse</div>
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${gh.configured ? "text-pass bg-pass/10 border border-pass/30" : "text-muted bg-paper-3 border border-rule"}`}>
              {gh.configured ? "connected" : "not configured"}
            </span>
          </div>
          <p className="text-xs text-muted">Auto-trigger Veryfi when candidates reach a pipeline stage.</p>
        </button>

        <button onClick={() => setTab("lever")} className={`panel p-5 text-left ${tab === "lever" ? "ring-2 ring-accent/40" : ""}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-display text-lg text-ink">Lever</div>
            <span className={`text-xs px-2 py-0.5 rounded font-mono ${lv.configured ? "text-pass bg-pass/10 border border-pass/30" : "text-muted bg-paper-3 border border-rule"}`}>
              {lv.configured ? "connected" : "not configured"}
            </span>
          </div>
          <p className="text-xs text-muted">Auto-trigger Veryfi on a Lever opportunity stage change.</p>
        </button>

        <div className="panel p-5 opacity-50">
          <div className="font-display text-lg text-ink mb-2">Workday</div>
          <p className="text-xs text-muted">Coming soon.</p>
        </div>
      </div>

      {tab === "greenhouse" ? <GreenhouseForm config={gh} onSaved={setGh} /> : <LeverForm config={lv} onSaved={setLv} />}
    </div>
  );
}

function GreenhouseForm({ config, onSaved }: { config: GhConfig; onSaved: (c: GhConfig) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [triggerStageId, setTriggerStageId] = useState("");
  const [autoPostNote, setAutoPostNote] = useState(true);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config.triggerStageId) setTriggerStageId(config.triggerStageId);
    if (config.autoPostNote !== undefined) setAutoPostNote(config.autoPostNote);
  }, [config.triggerStageId, config.autoPostNote]);

  async function testConnection() {
    setTesting(true); setTestResult(null); setErr(null);
    try {
      const r = await fetch("/api/integrations/greenhouse", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ harvestApiKey: apiKey }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setTestResult("Connected successfully");
    } catch (e) { setErr((e as Error).message); } finally { setTesting(false); }
  }

  async function loadStages() {
    if (!apiKey) return;
    setLoadingStages(true);
    try {
      const r = await fetch("/api/integrations/greenhouse/stages", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ harvestApiKey: apiKey }),
      });
      if (r.ok) setStages((await r.json()).stages);
    } catch { /* ignore */ } finally { setLoadingStages(false); }
  }

  async function save() {
    setSaving(true); setErr(null); setSaved(false);
    try {
      const r = await fetch("/api/integrations/greenhouse", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ harvestApiKey: apiKey, webhookSecret, triggerStageId, jobIds: [], autoPostNote, enabled: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j.error));
      setSaved(true);
      const updated: GhConfig = await (await fetch("/api/integrations/greenhouse")).json();
      onSaved(updated);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div className="panel p-6">
      <div className="label mb-4">Greenhouse configuration</div>

      {config.configured && (
        <div className="mb-4 p-3 bg-pass/5 border border-pass/20 rounded text-sm text-muted">
          Currently using API key starting with <code className="font-mono text-xs">{config.harvestApiKeyPrefix}</code>.
          Enter a new key below to update.
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="label block mb-1">Harvest API key</label>
          <div className="flex gap-2">
            <input className="field flex-1" type="password"
              placeholder={config.configured ? "Enter to update" : "Your Greenhouse Harvest API key"}
              value={apiKey} onChange={(e) => { setApiKey(e.target.value); setTestResult(null); setStages([]); }} />
            <button className="btn-ghost shrink-0" disabled={!apiKey || testing} onClick={testConnection}>{testing ? "Testing…" : "Test"}</button>
          </div>
          {testResult && <div className="text-pass text-xs mt-1">{testResult}</div>}
          {err && <div className="text-risk text-xs mt-1">{err}</div>}
        </div>

        <div>
          <label className="label block mb-1">Webhook signing secret</label>
          <input className="field w-full" type="password"
            placeholder="Secret set in Greenhouse webhook settings"
            value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
          <div className="text-xs text-muted mt-1">
            Webhook URL: <code className="font-mono text-[10px] bg-paper-3 px-1 rounded">{typeof window !== "undefined" ? window.location.origin : ""}/api/integrations/greenhouse/webhook</code>
          </div>
        </div>

        <div>
          <label className="label block mb-1">Trigger stage</label>
          <div className="flex gap-2">
            <select className="field flex-1" value={triggerStageId} onChange={(e) => setTriggerStageId(e.target.value)}>
              <option value="">Select a stage…</option>
              {stages.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>{s.name ?? s.text}</option>
              ))}
            </select>
            <button className="btn-ghost shrink-0" disabled={!apiKey || loadingStages} onClick={loadStages}>{loadingStages ? "Loading…" : "Load stages"}</button>
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={autoPostNote} onChange={(e) => setAutoPostNote(e.target.checked)} className="accent-[#4d8dff]" />
          <span className="text-sm text-ink">Auto-post candidate link as Greenhouse note</span>
        </label>

        {saved && <div className="text-pass text-sm">Configuration saved.</div>}

        <button className="btn-primary" disabled={saving || !apiKey || !webhookSecret || !triggerStageId} onClick={save}>
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </div>
  );
}

function LeverForm({ config, onSaved }: { config: LvConfig; onSaved: (c: LvConfig) => void }) {
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [triggerStageId, setTriggerStageId] = useState("");
  const [autoPostNote, setAutoPostNote] = useState(true);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingStages, setLoadingStages] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config.triggerStageId) setTriggerStageId(config.triggerStageId);
    if (config.autoPostNote !== undefined) setAutoPostNote(config.autoPostNote);
  }, [config.triggerStageId, config.autoPostNote]);

  async function testConnection() {
    setTesting(true); setTestResult(null); setErr(null);
    try {
      const r = await fetch("/api/integrations/lever", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setTestResult("Connected successfully");
    } catch (e) { setErr((e as Error).message); } finally { setTesting(false); }
  }

  async function loadStages() {
    if (!apiKey) return;
    setLoadingStages(true);
    try {
      const r = await fetch("/api/integrations/lever/stages", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (r.ok) setStages((await r.json()).stages);
    } catch { /* ignore */ } finally { setLoadingStages(false); }
  }

  async function save() {
    setSaving(true); setErr(null); setSaved(false);
    try {
      const r = await fetch("/api/integrations/lever", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey, webhookSecret, triggerStageId, autoPostNote, enabled: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j.error));
      setSaved(true);
      const updated: LvConfig = await (await fetch("/api/integrations/lever")).json();
      onSaved(updated);
    } catch (e) { setErr((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div className="panel p-6">
      <div className="label mb-4">Lever configuration</div>

      {config.configured && (
        <div className="mb-4 p-3 bg-pass/5 border border-pass/20 rounded text-sm text-muted">
          Currently using API key starting with <code className="font-mono text-xs">{config.apiKeyPrefix}</code>.
          Enter a new key below to update.
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="label block mb-1">Lever API key</label>
          <div className="flex gap-2">
            <input className="field flex-1" type="password"
              placeholder={config.configured ? "Enter to update" : "Your Lever API key"}
              value={apiKey} onChange={(e) => { setApiKey(e.target.value); setTestResult(null); setStages([]); }} />
            <button className="btn-ghost shrink-0" disabled={!apiKey || testing} onClick={testConnection}>{testing ? "Testing…" : "Test"}</button>
          </div>
          {testResult && <div className="text-pass text-xs mt-1">{testResult}</div>}
          {err && <div className="text-risk text-xs mt-1">{err}</div>}
        </div>

        <div>
          <label className="label block mb-1">Webhook signing secret</label>
          <input className="field w-full" type="password"
            placeholder="Secret configured in Lever webhook settings"
            value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} />
          <div className="text-xs text-muted mt-1">
            Webhook URL: <code className="font-mono text-[10px] bg-paper-3 px-1 rounded">{typeof window !== "undefined" ? window.location.origin : ""}/api/integrations/lever/webhook</code>
          </div>
        </div>

        <div>
          <label className="label block mb-1">Trigger stage</label>
          <div className="flex gap-2">
            <select className="field flex-1" value={triggerStageId} onChange={(e) => setTriggerStageId(e.target.value)}>
              <option value="">Select a stage…</option>
              {stages.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>{s.text ?? s.name}</option>
              ))}
            </select>
            <button className="btn-ghost shrink-0" disabled={!apiKey || loadingStages} onClick={loadStages}>{loadingStages ? "Loading…" : "Load stages"}</button>
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={autoPostNote} onChange={(e) => setAutoPostNote(e.target.checked)} className="accent-[#4d8dff]" />
          <span className="text-sm text-ink">Auto-post candidate link as Lever note</span>
        </label>

        {saved && <div className="text-pass text-sm">Configuration saved.</div>}

        <button className="btn-primary" disabled={saving || !apiKey || !webhookSecret || !triggerStageId} onClick={save}>
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </div>
  );
}
