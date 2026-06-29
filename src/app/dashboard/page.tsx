"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BandBadge, InitialsAvatar } from "@/components/ui";
import { Plus } from "@/components/icons";

interface Row { id: string; candidateName: string; candidateEmail: string; roleContext: string; status: string; band: string | null; riskScore: number | null; verdict: string | null; createdAt: string }
interface Stats { total: number; pending: number; thisMonth: number; flagged: number; review: number; pass: number }

const PAGE_SIZE = 8;
type Band = "all" | "pass" | "review" | "risk";
const BAND_TABS: { key: Band; label: string; tone: string }[] = [
  { key: "all", label: "All", tone: "text-ink" },
  { key: "pass", label: "Pass", tone: "text-pass" },
  { key: "review", label: "Review", tone: "text-review" },
  { key: "risk", label: "Risk", tone: "text-risk" },
];

export default function Dashboard() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  // Presentational filters — operate purely on the already-fetched rows; no
  // change to data fetching, polling, or the API.
  const [band, setBand] = useState<Band>("all");
  const [statusF, setStatusF] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Live: poll every 5s (and on tab focus) so results, deletions and counts
  // update in real time without a manual refresh.
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const d = await (await fetch("/api/verifications")).json();
        if (active) { setRows(d.verifications); setStats(d.stats); }
      } catch { /* transient — keep polling */ }
    };
    load();
    const iv = setInterval(load, 5000);
    window.addEventListener("focus", load);
    return () => { active = false; clearInterval(iv); window.removeEventListener("focus", load); };
  }, []);

  // Debounce the search box (250ms).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to the first page whenever a filter changes.
  useEffect(() => { setPage(1); }, [band, statusF, debouncedSearch]);

  async function del(id: string, name: string) {
    if (!confirm(`Delete the verification for ${name}? This permanently removes the profile and its result.`)) return;
    const r = await fetch(`/api/verifications/${id}`, { method: "DELETE" });
    if (r.ok) setRows((rs) => rs.filter((x) => x.id !== id));
  }

  const filtered = useMemo(() => rows.filter((r) => {
    if (band !== "all" && r.band !== band) return false;
    if (statusF && r.status !== statusF) return false;
    if (debouncedSearch) {
      const hay = `${r.candidateName} ${r.candidateEmail} ${r.roleContext}`.toLowerCase();
      if (!hay.includes(debouncedSearch)) return false;
    }
    return true;
  }), [rows, band, statusF, debouncedSearch]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      {/* page header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em] text-ink">Verifications</h1>
          <p className="mt-1.5 text-[14px] text-muted">Candidate identity &amp; interview-integrity checks.</p>
        </div>
        <Link href="/verify/new" className="inline-flex items-center gap-[7px] rounded-[9px] bg-accent px-[18px] py-2.5 text-[14px] font-semibold text-paper transition-shadow hover:shadow-glow">
          <Plus size={15} /> New verification
        </Link>
      </div>

      {/* stats */}
      <div className="mb-[22px] grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard label="This month" value={stats?.thisMonth ?? 0} caption="billable checks" accent={<span className="font-mono text-[11px] text-pass">▲</span>} />
        <StatCard label="Pending" value={stats?.pending ?? 0} caption="awaiting candidate" tone="text-accent" dot="#4d8dff" />
        <StatCard label="Review" value={stats?.review ?? 0} caption="needs a human call" tone="text-review" dot="#f3b34d" />
        <StatCard label="High risk" value={stats?.flagged ?? 0} caption="flagged this month" tone="text-risk" dot="#ff6f6b" />
      </div>

      {/* filter bar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-[10px] border border-[#1a2440] bg-paper-2 p-[3px]">
          {BAND_TABS.map((t) => (
            <button key={t.key} onClick={() => setBand(t.key)}
              className={`rounded-[7px] px-3 py-[5px] font-mono text-[11.5px] transition-colors ${band === t.key ? "bg-accent/[0.16] text-ink" : `${t.tone} hover:text-ink`}`}>
              {t.label}
            </button>
          ))}
        </div>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)}
          className="cursor-pointer rounded-[9px] border border-[#1a2440] bg-paper-2 px-3 py-[7px] font-body text-[12.5px] text-muted outline-none">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="complete">Complete</option>
          <option value="expired">Expired</option>
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search candidates…"
          className="w-[200px] rounded-[9px] border border-[#1a2440] bg-paper-2 px-3 py-[7px] text-[12.5px] text-ink outline-none placeholder:text-[#5d6b8c] focus:border-accent" />
        <div className="flex-1" />
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#5d6b8c]">
          <span className="h-1.5 w-1.5 rounded-full bg-pass animate-blink" style={{ animationDuration: "1.8s" }} />
          Live · {rows.length} records
        </span>
      </div>

      {/* table */}
      <div className="overflow-hidden rounded-[14px] border border-[#1a2440] bg-[#0b1120]">
        <div className="grid grid-cols-[2.4fr_1.6fr_1fr_1fr_1.2fr_0.8fr] gap-3 border-b border-[#161f38] px-[22px] py-[13px] font-mono text-[10px] uppercase tracking-[0.1em] text-[#5d6b8c]">
          <span>Candidate</span><span>Role</span><span>Status</span><span>Result</span><span>Risk</span><span className="text-right">Actions</span>
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-16 text-center text-[14px] text-muted">
            No verifications yet. <Link href="/verify/new" className="text-accent">Create your first →</Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center text-[14px] text-muted">No verifications match these filters.</div>
        ) : (
          <>
            {paged.map((r) => (
              <div key={r.id} className="grid grid-cols-[2.4fr_1.6fr_1fr_1fr_1.2fr_0.8fr] items-center gap-3 border-b border-[#131c30] px-[22px] py-3.5 transition-colors hover:bg-[#162038]/50">
                <div className="flex min-w-0 items-center gap-[11px]">
                  <InitialsAvatar name={r.candidateName} />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] text-ink">{r.candidateName}</div>
                    <div className="truncate text-[12px] text-[#5d6b8c]">{r.candidateEmail}</div>
                  </div>
                </div>
                <div className="truncate text-[13px] text-muted">{r.roleContext || "—"}</div>
                <div>
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusDot(r.status) }} />{r.status}
                  </span>
                </div>
                <div><BandBadge band={r.band} /></div>
                <div><RiskBar score={r.riskScore} band={r.band} /></div>
                <div className="whitespace-nowrap text-right">
                  <Link href={`/verify/${r.id}`} className="text-[13px] text-accent hover:underline">Open</Link>
                  <button onClick={() => del(r.id, r.candidateName)} className="ml-3.5 text-[13px] text-[#4d597a] transition-colors hover:text-risk" title="Delete profile">Delete</button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-[22px] py-[13px] text-[12.5px] text-[#5d6b8c]">
              <span>Showing {paged.length} of {filtered.length}</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
                  className="rounded-lg border border-[#1e2842] bg-paper-2 px-3 py-1.5 text-[12.5px] text-muted transition-colors enabled:hover:border-accent/50 enabled:hover:text-accent disabled:opacity-40">← Prev</button>
                <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}
                  className="rounded-lg border border-[#1e2842] bg-paper-2 px-3 py-1.5 text-[12.5px] text-ink transition-colors enabled:hover:border-accent/50 enabled:hover:text-accent disabled:opacity-40">Next →</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function statusDot(status: string): string {
  if (status === "processing") return "#4d8dff";
  if (status === "pending") return "#7c6a3a";
  if (status === "expired") return "#ff6f6b";
  if (status === "complete") return "#3a4d7d";
  return "#3a4d7d";
}

function RiskBar({ score, band }: { score: number | null; band: string | null }) {
  if (score == null) return <span className="font-mono text-[13px] text-[#4d597a]">—</span>;
  const color = band === "risk" ? "#ff6f6b" : band === "review" ? "#f3b34d" : "#3ddc97";
  return (
    <div className="flex items-center gap-[9px]">
      <span className="w-[22px] font-mono text-[13px] text-ink">{score}</span>
      <div className="h-[5px] max-w-[64px] flex-1 overflow-hidden rounded" style={{ background: "#101a30" }}>
        <div className="h-full rounded" style={{ width: `${Math.min(100, score)}%`, background: color }} />
      </div>
    </div>
  );
}

function StatCard({ label, value, caption, tone, dot, accent }: {
  label: string; value: number; caption: string; tone?: string; dot?: string; accent?: ReactNode;
}) {
  return (
    <div className="rounded-[13px] border border-[#1a2440] px-5 py-[18px]" style={{ background: "linear-gradient(180deg,#0d1426,#0b1120)" }}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#7c89a8]">{label}</span>
        {accent ?? (dot ? <span className="h-[7px] w-[7px] rounded-full" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} /> : null)}
      </div>
      <div className={`font-display text-[30px] font-semibold leading-none ${tone ?? "text-ink"}`}>{value}</div>
      <div className="mt-[5px] text-[11.5px] text-[#5d6b8c]">{caption}</div>
    </div>
  );
}
