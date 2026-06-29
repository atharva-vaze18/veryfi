"use client";
import { useEffect, useState, type ReactNode, type ComponentType } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { OrbytMark, InitialsAvatar } from "./ui";
import {
  Plus, ListChecks, Webhook, KeyRound, Boxes, Sliders, Users, CreditCard, Cog,
  Search, Bell, LogOut,
} from "./icons";

interface Me { name: string; email: string; role?: string; orgName?: string; emailVerified?: boolean }
interface Usage { usage: number; quota: number; plan: string; metered: boolean }

type NavItem = { href: string; label: string; icon: ComponentType<{ size?: number }> };
const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  { group: "Workspace", items: [
    { href: "/dashboard", label: "Verifications", icon: ListChecks },
  ] },
  { group: "Developers", items: [
    { href: "/dashboard/settings/webhooks", label: "Webhooks", icon: Webhook },
    { href: "/dashboard/settings/api", label: "API Keys", icon: KeyRound },
    { href: "/dashboard/settings/integrations", label: "Integrations", icon: Boxes },
    { href: "/dashboard/settings/scoring", label: "Scoring", icon: Sliders },
  ] },
  { group: "Account", items: [
    { href: "/settings/team", label: "Team", icon: Users },
    { href: "/settings/billing", label: "Billing", icon: CreditCard },
    { href: "/dashboard/settings", label: "Account", icon: Cog },
  ] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) { router.replace("/auth"); return; }
      setMe((await r.json()).user); setLoading(false);
    });
    fetch("/api/billing").then(async (r) => { if (r.ok) setUsage(await r.json()); }).catch(() => {});
  }, [router, pathname]);

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/auth"); }

  if (loading) return <div className="p-10 text-muted text-sm">Loading…</div>;

  // Exact match for the dashboard root and the settings hub so they aren't
  // marked active on their own sub-routes.
  const isActive = (href: string) =>
    href === "/dashboard" || href === "/dashboard/settings"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");
  const overQuota = usage && usage.metered && usage.usage >= usage.quota;
  const usagePct = usage && usage.metered && usage.quota > 0 ? Math.min(100, (usage.usage / usage.quota) * 100) : 0;

  return (
    <div className="relative z-10 flex min-h-screen">
      {/* SIDEBAR */}
      <aside className="sticky top-0 hidden h-screen w-[236px] flex-shrink-0 flex-col border-r border-[#161f38] bg-[#090e1c] md:flex">
        <div className="flex items-center gap-2.5 border-b border-[#141d33] px-5 pb-[18px] pt-5">
          <OrbytMark size={24} />
          <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">Veryfi</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <Link href="/verify/new"
            className="mx-1 mb-[18px] flex items-center justify-center gap-[7px] rounded-[9px] bg-accent px-3 py-2.5 text-[13.5px] font-semibold text-paper transition-shadow hover:shadow-glow">
            <Plus size={15} /> New verification
          </Link>

          {NAV_GROUPS.map(({ group, items }) => (
            <div key={group}>
              <div className="px-3 pb-2 pt-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#4d597a]">{group}</div>
              {items.map(({ href, label, icon: Ico }) => {
                const active = isActive(href);
                return (
                  <Link key={href} href={href}
                    className={`mb-0.5 flex items-center gap-[11px] rounded-lg px-3 py-2.5 text-[14px] transition-colors ${active
                      ? "bg-accent/[0.14] text-ink shadow-[inset_2px_0_0_#4d8dff]"
                      : "text-muted hover:bg-accent/5 hover:text-ink"}`}>
                    <span className={active ? "text-accent" : ""}><Ico size={17} /></span>{label}
                  </Link>
                );
              })}
              <div className="h-2.5" />
            </div>
          ))}
        </nav>

        <div className="border-t border-[#141d33] p-3.5">
          {usage && (
            <>
              <div className="mb-2.5 flex items-center justify-between px-1">
                <span className={`font-mono text-[10px] uppercase tracking-[0.06em] ${overQuota ? "text-risk" : "text-muted"}`}>{usage.plan} plan</span>
                <span className="font-mono text-[10px] text-ink-2">{usage.usage}{usage.metered ? `/${usage.quota}` : ""}</span>
              </div>
              <div className="mx-1 mb-3.5 h-[5px] overflow-hidden rounded" style={{ background: "#101a30" }}>
                <div className={`h-full rounded ${overQuota ? "bg-risk" : "bg-accent"}`} style={{ width: `${usagePct}%` }} />
              </div>
            </>
          )}
          <div className="flex items-center gap-2.5 px-1 py-1.5">
            <InitialsAvatar name={me?.name ?? me?.email ?? "?"} size={30} radius={8} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] text-ink">{me?.name ?? me?.email}</div>
              <div className="truncate text-[11px] text-[#5d6b8c]">{me?.orgName ?? me?.email}</div>
            </div>
            <button onClick={logout} title="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:text-risk">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* topbar */}
        <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-[#161f38] bg-paper/[0.78] px-5 backdrop-blur-md md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 md:hidden"><OrbytMark size={22} /></Link>
            <div className="relative hidden w-[320px] max-w-[38vw] sm:block">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5d6b8c]"><Search size={15} /></span>
              <input placeholder="Search candidates, emails, sessions…"
                className="w-full rounded-[9px] border border-[#1e2842] bg-paper-2 py-2 pl-[34px] pr-3 text-[13px] text-ink outline-none placeholder:text-[#5d6b8c]" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-[7px] font-mono text-[11px] text-muted sm:inline-flex">
              <span className="h-[7px] w-[7px] rounded-full bg-pass animate-blink" style={{ boxShadow: "0 0 8px #3ddc97", animationDuration: "1.6s" }} />
              All systems live
            </span>
            <button className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-[#1e2842] bg-paper-2 text-muted transition-colors hover:text-ink" title="Notifications">
              <Bell size={17} />
            </button>
            <button onClick={logout} className="text-muted transition-colors hover:text-risk md:hidden" title="Sign out"><LogOut size={18} /></button>
          </div>
        </header>

        {me && me.emailVerified === false && <UnverifiedBanner email={me.email} />}

        <div className="w-full max-w-[1240px] flex-1 px-5 py-7 md:px-7 animate-fade-up">{children}</div>
      </main>
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
      <div className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm md:px-7">
        <div className="text-ink">
          <span className="mr-2 font-mono text-xs uppercase text-review">unverified</span>
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
