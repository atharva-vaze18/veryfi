"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

interface MfaStatus { enabled: boolean }

export default function SettingsPage() {
  return <AppShell><Inner /></AppShell>;
}

function Inner() {
  const [mfa, setMfa] = useState<MfaStatus>({ enabled: false });
  const [me, setMe] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(async (r) => {
      if (!r.ok) return;
      const j = await r.json();
      setMe({ email: j.user.email, role: j.user.role });
      // The /me payload doesn't carry mfaEnabled (it's not in the JWT) — read
      // it from a tiny dedicated endpoint instead. We'll piggyback the team
      // record for that until a dedicated user-prefs endpoint exists.
    });
    fetch("/api/auth/mfa/status").then(async (r) => { if (r.ok) setMfa(await r.json()); });
  }, []);

  return (
    <div>
      <div className="mb-6">
        <div className="text-muted text-sm mb-1">
          <Link href="/dashboard" className="hover:text-accent">Dashboard</Link>
          {" → "}Settings
        </div>
        <h1 className="font-display text-3xl text-ink">Account settings</h1>
        <p className="text-muted text-sm mt-1">Security and account preferences for {me?.email ?? "your account"}.</p>
      </div>

      <MfaSection enabled={mfa.enabled} onChange={(e) => setMfa({ enabled: e })} canDisable={me?.role === "owner" || me?.role === "admin"} />
    </div>
  );
}

function MfaSection({ enabled, onChange, canDisable }: { enabled: boolean; onChange: (e: boolean) => void; canDisable: boolean }) {
  const [phase, setPhase] = useState<"idle" | "setup" | "verify" | "backup">("idle");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function startSetup() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not start MFA setup");
      setQr(j.qrDataUrl); setSecret(j.secret); setPhase("setup");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/auth/mfa/verify-setup", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error === "invalid_code" ? "That code didn't match — try the next one." : j.error);
      setBackupCodes(j.backupCodes); setPhase("backup"); onChange(true);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/auth/mfa/disable", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error === "invalid_code" ? "That code didn't match — try the next one." : j.error);
      onChange(false); setPhase("idle"); setCode("");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  if (enabled) {
    return (
      <div className="panel p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="font-display text-lg text-ink">Two-factor authentication</div>
          <span className="text-xs px-2 py-0.5 rounded font-mono text-pass bg-pass/10 border border-pass/30">enabled</span>
        </div>
        <p className="text-muted text-sm mb-4">Your account requires a TOTP code at every login. Disabling requires a valid code from your authenticator.</p>
        {canDisable ? (
          <div className="space-y-3">
            <input className="field" placeholder="6-digit code or backup code" value={code} onChange={(e) => setCode(e.target.value)} />
            {err && <div className="text-risk text-xs">{err}</div>}
            <button className="btn-ghost" disabled={busy || code.length < 6} onClick={disable}>
              {busy ? "Disabling…" : "Disable MFA"}
            </button>
          </div>
        ) : (
          <p className="text-muted text-xs">Only owners and admins can disable MFA on their account.</p>
        )}
      </div>
    );
  }

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="font-display text-lg text-ink">Two-factor authentication</div>
        <span className="text-xs px-2 py-0.5 rounded font-mono text-muted bg-paper-3 border border-rule">off</span>
      </div>
      <p className="text-muted text-sm mb-4">Add a second factor for every login. Compatible with Google Authenticator, 1Password, Authy, and other TOTP apps.</p>

      {phase === "idle" && (
        <button className="btn-primary" disabled={busy} onClick={startSetup}>
          {busy ? "Preparing…" : "Enable two-factor authentication"}
        </button>
      )}

      {phase === "setup" && qr && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <img src={qr} alt="MFA QR code" className="w-44 h-44 rounded border border-rule bg-white p-2" />
            <div className="space-y-2 text-sm">
              <p className="text-ink">Scan the QR with your authenticator app.</p>
              <p className="text-muted text-xs">Or type the secret manually:</p>
              <code className="font-mono text-xs break-all bg-paper-3 px-2 py-1 rounded">{secret}</code>
            </div>
          </div>
          <button className="btn-primary" onClick={() => { setPhase("verify"); setErr(null); }}>I've scanned it →</button>
        </div>
      )}

      {phase === "verify" && (
        <div className="space-y-3">
          <p className="text-sm text-ink">Enter the 6-digit code from your authenticator app.</p>
          <input className="field" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.trim())} autoFocus />
          {err && <div className="text-risk text-xs">{err}</div>}
          <button className="btn-primary" disabled={busy || code.length !== 6} onClick={verify}>{busy ? "Verifying…" : "Confirm and enable"}</button>
        </div>
      )}

      {phase === "backup" && (
        <div className="space-y-3">
          <p className="text-sm text-ink">MFA is on. Save these backup codes somewhere safe — they're shown <b>once</b> and each works a single time if you lose your authenticator.</p>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
            {backupCodes.map((c) => <li key={c} className="bg-paper-3 px-3 py-2 rounded border border-rule">{c}</li>)}
          </ul>
          <button className="btn-ghost" onClick={() => { setPhase("idle"); setBackupCodes([]); }}>Done</button>
        </div>
      )}
    </div>
  );
}
