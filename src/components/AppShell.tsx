"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Brand } from "./ui";

interface Me { name: string; email: string; role?: string; orgName?: string; emailVerified?: boolean }
interface Usage { usage: number; quota: number; plan: string; metered: boolean }

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.replace("/"); return; }
      setMe((await r.json()).user); setLoading(false);
    });
    fetch("/api/billing").then(async (r) => { if (r.ok) setUsage(await r.json()); }).catch(() => {});
  }, [router, pathname]);

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/"); }

  if (loading) return <div className="p-10 text-muted text-sm">Loading…</div>;

  const nav = [
    { href: "/dashboard", label: "Verifications" },
    { href: "/verify/new", label: "New" },
    { href: "/dashboard/settings/webhooks", label: "Webhooks" },
    { href: "/dashboard/settings/api", label: "API Keys" },
    { href: "/dashboard/settings/integrations", label: "Integrations" },
    { href: "/dashboard/settings/scoring", label: "Scoring" },
    { href: "/settings/team", label: "Team" },
    { href: "/settings/billing", label: "Billing" },
  ];
  const overQuota = usage && usage.metered && usage.usage >= usage.quota;
  return (
    <div className="min-h-screen relative z-10">
      <header className="sticky top-0 z-20 border-b border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto max-w-[1180px] px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="hover:opacity-80 transition-opacity" title="Home"><Brand /></Link>
            <nav className="flex items-center gap-1">
              {nav.map((n) => {
                const active = pathname === n.href || pathname.startsWith(n.href + "/");
                return <Link key={n.href} href={n.href} className={`px-3 py-1.5 text-sm rounded transition-colors ${active ? "text-ink border-b-2 border-accent" : "text-muted hover:text-ink"}`}>{n.label}</Link>;
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {usage && (
              <Link href="/settings/billing" title="Usage this month"
                className={`hidden md:flex items-center gap-2 text-[11px] font-mono px-2.5 py-1 rounded border transition-colors ${overQuota ? "border-risk/40 text-risk bg-risk/5" : "border-rule text-muted hover:text-ink"}`}>
                <span className="uppercase tracking-wide">{usage.plan}</span>
                <span className="opacity-50">·</span>
                <span>{usage.usage}{usage.metered ? `/${usage.quota}` : ""}</span>
              </Link>
            )}
            <div className="text-right leading-tight hidden sm:block">
              <div className="text-xs text-ink">{me?.orgName}</div>
              <div className="label">{me?.email}</div>
            </div>
            <button onClick={logout} className="btn-ghost text-xs py-1.5">Sign out</button>
          </div>
        </div>
      </header>
      {me && me.emailVerified === false && <UnverifiedBanner email={me.email} />}
      <main className="mx-auto max-w-[1180px] px-6 py-8 animate-fade-up">{children}</main>
    </div>
  );
}

function UnverifiedBanner({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function resend() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (r.ok) setMsg("Verification email sent. Check your inbox.");
      else if (r.status === 429) setMsg("Too many requests. Try again later.");
      else setMsg("Could not send email. Try again in a minute.");
    } catch { setMsg("Network error."); }
    finally { setBusy(false); }
  }
  return (
    <div className="border-b border-review/30 bg-review/5">
      <div className="mx-auto max-w-[1180px] px-6 py-2.5 flex items-center justify-between gap-4 text-sm">
        <div className="text-ink">
          <span className="font-mono text-xs uppercase text-review mr-2">unverified</span>
          Check your inbox to verify <b>{email}</b> before sending candidate links.
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-muted">{msg}</span>}
          <button onClick={resend} disabled={busy} className="btn-ghost text-xs py-1">
            {busy ? "Sending…" : "Resend email"}
          </button>
        </div>
      </div>
    </div>
  );
}
