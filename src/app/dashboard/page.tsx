"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BandBadge } from "@/components/ui";

interface Row { id: string; candidateName: string; candidateEmail: string; roleContext: string; status: string; band: string | null; riskScore: number | null; verdict: string | null; createdAt: string }
interface Stats { total: number; pending: number; thisMonth: number; flagged: number; review: number; pass: number }
interface PageInfo { page: number; limit: number; total: number; pages: number }

type BandFilter = "" | "pass" | "review" | "risk";
type StatusFilter = "" | "pending" | "consented" | "processing" | "complete" | "expired";

export default function Dashboard() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ page: 1, limit: 25, total: 0, pages: 1 });
  const [band, setBand] = useState<BandFilter>("");
  const [statusF, setStatusF] = useState<StatusFilter>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounce the search input so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever a filter changes — otherwise a deep page may
  // become empty after narrowing the result set.
  useEffect(() => { setPage(1); }, [band, statusF, debouncedSearch]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: "25" });
    if (band) p.set("band", band);
    if (statusF) p.set("status", statusF);
    if (debouncedSearch) p.set("search", debouncedSearch);
    return p.toString();
  }, [page, band, statusF, debouncedSearch]);

  // Live polling: every 5s, but only when there are pending verifications on
  // the visible page (deepfake finalize etc). Otherwise the list is steady and
  // we just refresh on tab focus.
  useEffect(() => {
    let active = true;
    const load = async () => {
      if (document.hidden) return;
      try {
        const d = await (await fetch(`/api/verifications?${query}`)).json();
        if (active) {
          setRows(d.verifications);
          setStats(d.stats);
          setPageInfo(d.page);
        }
      } catch { /* transient — keep polling */ }
    };
    load();
    const hasPending = rows.some((r) => r.status !== "complete");
    const iv = hasPending ? setInterval(load, 5000) : null;
    window.addEventListener("focus", load);
    return () => { active = false; if (iv) clearInterval(iv); window.removeEventListener("focus", load); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, rows.some((r) => r.status !== "complete")]);

  async function del(id: string, name: string) {
    if (!confirm(`Delete the verification for ${name}? This permanently removes the profile and its result.`)) return;
    const r = await fetch(`/api/verifications/${id}`, { method: "DELETE" });
    if (r.ok) setRows((rs) => rs.filter((x) => x.id !== id));
  }

  const hasFilters = band !== "" || statusF !== "" || debouncedSearch !== "";

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

      {/* Filter bar */}
      <div className="panel mb-4 px-4 py-3 flex flex-wrap items-center gap-2">
        <BandPill label="All" active={band === ""} onClick={() => setBand("")} />
        <BandPill label="Pass" active={band === "pass"} onClick={() => setBand("pass")} tone="text-pass" />
        <BandPill label="Review" active={band === "review"} onClick={() => setBand("review")} tone="text-review" />
        <BandPill label="Risk" active={band === "risk"} onClick={() => setBand("risk")} tone="text-risk" />
        <div className="w-px h-5 bg-rule mx-1" />
        <select className="field text-xs py-1.5" value={statusF} onChange={(e) => setStatusF(e.target.value as StatusFilter)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="consented">Consented</option>
          <option value="processing">Processing</option>
          <option value="complete">Complete</option>
          <option value="expired">Expired</option>
        </select>
        <input className="field text-xs py-1.5 flex-1 min-w-[200px]"
          placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {hasFilters && (
          <button className="text-xs text-muted hover:text-ink" onClick={() => { setBand(""); setStatusF(""); setSearch(""); }}>
            Clear
          </button>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="px-5 py-3 border-b border-rule flex items-center justify-between">
          <span className="font-display text-ink">Recent</span>
          <span className="label inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-pass animate-pulse" /> live · {pageInfo.total} records
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-12 text-center text-muted text-sm">
            {hasFilters
              ? <>No verifications match these filters.</>
              : <>No verifications yet. <Link href="/verify/new" className="text-accent">Create your first →</Link></>}
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
        {pageInfo.pages > 1 && (
          <div className="px-5 py-3 border-t border-rule flex items-center justify-between text-xs text-muted">
            <span>Page {pageInfo.page} of {pageInfo.pages}</span>
            <div className="flex items-center gap-2">
              <button className="btn-ghost text-xs py-1" disabled={pageInfo.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</button>
              <button className="btn-ghost text-xs py-1" disabled={pageInfo.page >= pageInfo.pages} onClick={() => setPage((p) => Math.min(pageInfo.pages, p + 1))}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BandPill({ label, active, onClick, tone }: { label: string; active: boolean; onClick: () => void; tone?: string }) {
  return (
    <button onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded font-mono transition-colors ${active ? "bg-accent/15 text-ink border border-accent/40" : `border border-rule ${tone ?? "text-muted"} hover:text-ink`}`}>
      {label}
    </button>
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
