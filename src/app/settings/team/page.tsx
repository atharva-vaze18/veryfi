"use client";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";

interface Member { id: string; email: string; name: string; role: string; createdAt: string; lastLoginAt: string | null }

export default function TeamPage() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [members, setMembers] = useState<Member[]>([]);
  const [you, setYou] = useState<string>("");
  const [role, setRole] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "member", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  async function load() {
    const j = await (await fetch("/api/team")).json();
    setMembers(j.users ?? []); setYou(j.you ?? "");
    const meRes = await fetch("/api/auth/me");
    if (meRes.ok) setRole((await meRes.json()).user.role);
  }
  useEffect(() => { load(); }, []);

  const canManage = role === "owner" || role === "admin";

  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error((await r.json()).error ?? "Could not add member");
      setCreated({ email: form.email, password: form.password });
      setForm({ name: "", email: "", role: "member", password: "" });
      setOpen(false);
      load();
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Remove ${email}? Their sign-in stops working immediately.`)) return;
    const r = await fetch(`/api/team/${id}`, { method: "DELETE" });
    if (r.ok) setMembers((m) => m.filter((x) => x.id !== id));
    else alert((await r.json()).error ?? "Could not remove");
  }

  async function resetPassword(id: string, email: string) {
    if (!confirm(`Reset the password for ${email}? Their current password stops working.`)) return;
    const r = await fetch(`/api/team/${id}/password`, { method: "POST" });
    const j = await r.json();
    if (r.ok) setCreated({ email: j.email, password: j.password });
    else alert(j.error ?? "Could not reset");
  }

  function genPassword() {
    const p = Array.from(crypto.getRandomValues(new Uint8Array(9))).map((b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 30]).join("");
    setForm((f) => ({ ...f, password: p }));
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl text-ink">Team</h1>
          <p className="text-muted text-sm mt-1">People who can sign in and run verifications for your company.</p>
        </div>
        {canManage && <button className="btn-primary" onClick={() => { setOpen((o) => !o); setCreated(null); }}>+ Add member</button>}
      </div>

      {created && (
        <div className="panel p-4 mb-5 border-pass/40 bg-pass/5">
          <div className="label mb-1 text-pass">Credentials — share securely (shown once)</div>
          <div className="font-mono text-sm text-ink">{created.email}</div>
          <div className="font-mono text-sm text-ink">password: {created.password}</div>
          <p className="text-xs text-muted mt-2">We don&apos;t show this again. Send it over a secure channel; they can change it later.</p>
        </div>
      )}

      {open && canManage && (
        <form onSubmit={add} className="panel p-5 mb-6 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label block mb-1">Name</label>
              <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sam Rivera" /></div>
            <div><label className="label block mb-1">Email</label>
              <input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="sam@acme.com" /></div>
            <div><label className="label block mb-1">Role</label>
              <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="member">Member — can run & view verifications</option>
                <option value="admin">Admin — also manages team & billing</option>
              </select></div>
            <div><label className="label block mb-1">Temporary password</label>
              <div className="flex gap-2">
                <input className="field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="8+ characters" />
                <button type="button" onClick={genPassword} className="btn-ghost whitespace-nowrap">Generate</button>
              </div></div>
          </div>
          {err && <div className="text-risk text-xs border border-risk/30 bg-risk/5 px-3 py-2 rounded">{err}</div>}
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? "Creating…" : "Create sign-in"}</button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left label">
            <th className="px-5 py-2 font-normal">Member</th>
            <th className="px-5 py-2 font-normal">Role</th>
            <th className="px-5 py-2 font-normal">Last sign-in</th>
            <th className="px-5 py-2 font-normal"></th>
          </tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-rule/60">
                <td className="px-5 py-3"><div className="text-ink">{m.name}{m.id === you ? <span className="text-muted text-xs"> (you)</span> : ""}</div><div className="text-muted text-xs">{m.email}</div></td>
                <td className="px-5 py-3"><span className={`text-xs uppercase tracking-wide ${m.role === "owner" ? "text-accent" : "text-muted"}`}>{m.role}</span></td>
                <td className="px-5 py-3 text-muted text-xs">{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString() : "never"}</td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  {canManage && m.id !== you && (
                    <button onClick={() => resetPassword(m.id, m.email)} className="text-muted hover:text-accent text-sm">Reset password</button>
                  )}
                  {canManage && m.role !== "owner" && m.id !== you && (
                    <button onClick={() => remove(m.id, m.email)} className="ml-4 text-muted hover:text-risk text-sm">Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!canManage && <p className="text-muted text-xs mt-4">Only owners and admins can add or remove members.</p>}
    </div>
  );
}
