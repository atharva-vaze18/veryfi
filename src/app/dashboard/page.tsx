"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BandBadge } from "@/components/ui";

interface Row { id: string; candidateName: string; candidateEmail: string; roleContext: string; status: string; band: string | null; riskScore: number | null; verdict: string | null; createdAt: string }
interface Stats { total: number; pending: number; thisMonth: number; flagged: number; review: number; pass: number }

export default function Dashboard() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/verifications").then((r) => r.json()).then((d) => { setRows(d.verifications); setStats(d.stats); });
  }, []);

  async function del(id: string, name: string) {
    if (!confirm(`Delete the verification for ${name}? This permanently removes the profile and its result.`)) return;
    const r = await fetch(`/api/verifications/${id}`, { method: "DELETE" });
    if (r.ok) setRows((rs) => rs.filter((x) => x.id !== id));
  }

  return (
    <div>
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-ink">Verifications</h1>
          <p className="text-muted text-sm mt-1">Candidate identity &amp; interview-integrity checks.</p>
        </div>
        <Link href="/verify/new" className="btn-primary">+ New verification</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-rule border border-rule rounded-lg overflow-hidden mb-8">
        <Stat label="This month" value={stats?.thisMonth ?? 0} hint="billable" />
        <Stat label="Pending" value={stats?.pending ?? 0} tone="text-accent" />
        <Stat label="Review" value={stats?.review ?? 0} tone="text-review" />
        <Stat label="High risk" value={stats?.flagged ?? 0} tone="text-risk" />
      </div>

      <div className="panel overflow-hidden">
        <div className="px-5 py-3 border-b border-rule flex items-center justify-between">
          <span className="font-display text-ink">Recent</span>
          <span className="label">{rows.length} records</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted text-sm">
            No verifications yet. <Link href="/verify/new" className="text-accent">Create your first →</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left label">
              <th className="px-5 py-2 font-normal">Candidate</th>
              <th className="px-5 py-2 font-normal">Role</th>
              <th className="px-5 py-2 font-normal">Status</th>
              <th className="px-5 py-2 font-normal">Result</th>
              <th className="px-5 py-2 font-normal">Risk</th>
              <th className="px-5 py-2 font-normal"></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-rule/60 hover:bg-paper-3/40">
                  <td className="px-5 py-3"><div className="text-ink">{r.candidateName}</div><div className="text-muted text-xs">{r.candidateEmail}</div></td>
                  <td className="px-5 py-3 text-muted text-xs">{r.roleContext || "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted">{r.status}</td>
                  <td className="px-5 py-3"><BandBadge band={r.band} /></td>
                  <td className="px-5 py-3 font-mono text-xs text-ink">{r.riskScore ?? "—"}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <Link href={`/verify/${r.id}`} className="text-accent text-sm">Open →</Link>
                    <button onClick={() => del(r.id, r.candidateName)} className="ml-4 text-muted hover:text-risk text-sm" title="Delete profile">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: string }) {
  return (
    <div className="bg-paper-2 px-5 py-4">
      <div className="label">{label}{hint ? ` · ${hint}` : ""}</div>
      <div className={`font-display text-3xl mt-1 ${tone ?? "text-ink"}`}>{value}</div>
    </div>
  );
}
