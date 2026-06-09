"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

interface PlanCard { id: string; name: string; priceLabel: string; monthlyQuota: number | null; blurb: string; purchasable: boolean; contactSales: boolean }
interface Billing {
  usage: number; quota: number; plan: string; metered: boolean; remaining: number;
  billingEnabled: boolean; canManage: boolean; plans: PlanCard[];
}

export default function BillingPage() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [b, setB] = useState<Billing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() { setB(await (await fetch("/api/billing")).json()); }
  useEffect(() => { load(); }, []);

  async function upgrade(plan: string) {
    setErr(null); setBusy(plan);
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not start checkout");
      window.location.href = j.url;
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  }
  async function portal() {
    setErr(null); setBusy("portal");
    try {
      const r = await fetch("/api/billing/portal", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not open portal");
      window.location.href = j.url;
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  }

  if (!b) return <p className="text-muted text-sm">Loading…</p>;
  const pct = b.quota ? Math.min(100, Math.round((b.usage / b.quota) * 100)) : 0;
  const over = b.metered && b.usage >= b.quota;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-3xl text-ink mb-1">Billing &amp; usage</h1>
      <p className="text-muted text-sm mb-6">Your plan, this month&apos;s usage, and upgrades.</p>

      {!b.billingEnabled && (
        <div className="panel p-4 mb-5 border-accent/30 bg-accent/5">
          <div className="text-sm text-ink">Self-serve billing isn&apos;t switched on yet.</div>
          <div className="text-xs text-muted mt-1">All accounts run unmetered until Stripe is configured (add the keys + plan price IDs). Usage below is still tracked.</div>
        </div>
      )}

      <div className="panel p-5 mb-6">
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="label">Current plan</div>
            <div className="font-display text-2xl text-ink capitalize">{b.plan}</div>
          </div>
          <div className="text-right">
            <div className="label">This month</div>
            <div className={`font-mono text-lg ${over ? "text-risk" : "text-ink"}`}>{b.usage}{b.metered ? ` / ${b.quota}` : ""}</div>
          </div>
        </div>
        {b.metered && (
          <>
            <div className="h-2 rounded-full bg-paper-3 overflow-hidden">
              <div className={`h-full ${over ? "bg-risk" : pct > 80 ? "bg-review" : "bg-accent"}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-muted mt-2">{over ? "Over the monthly limit — upgrade to keep verifying." : `${b.remaining} verifications left this month.`}</div>
          </>
        )}
        {b.canManage && b.billingEnabled && b.plan !== "free" && (
          <button onClick={portal} disabled={busy === "portal"} className="btn-ghost mt-4">{busy === "portal" ? "Opening…" : "Manage subscription / invoices"}</button>
        )}
      </div>

      {err && <div className="text-risk text-xs border border-risk/30 bg-risk/5 px-3 py-2 rounded mb-4">{err}</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {b.plans.map((p) => {
          const current = p.id === b.plan;
          return (
            <div key={p.id} className={`panel p-4 flex flex-col ${current ? "border-accent" : ""}`}>
              <div className="font-display text-lg text-ink">{p.name}</div>
              <div className="font-mono text-sm text-accent mt-0.5">{p.priceLabel}</div>
              <div className="text-xs text-muted mt-2 flex-1">{p.blurb}</div>
              <div className="mt-3">
                {current ? (
                  <div className="text-xs text-center py-2 rounded border border-accent/40 text-accent">Current plan</div>
                ) : p.contactSales ? (
                  <a href="mailto:sales@orbyt.io" className="btn-ghost w-full text-center text-sm">Contact sales</a>
                ) : p.purchasable && b.canManage ? (
                  <button onClick={() => upgrade(p.id)} disabled={busy === p.id} className="btn-primary w-full text-sm">{busy === p.id ? "…" : "Upgrade"}</button>
                ) : (
                  <div className="text-xs text-center py-2 text-muted">{b.canManage ? "Unavailable" : "Owner/admin only"}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
