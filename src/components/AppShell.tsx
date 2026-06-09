"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Brand } from "./ui";

interface Me { name: string; email: string; role?: string; orgName?: string }
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
      <main className="mx-auto max-w-[1180px] px-6 py-8 animate-fade-up">{children}</main>
    </div>
  );
}
