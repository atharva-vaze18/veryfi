import { env, features } from "./env";

// Transactional email via Resend REST API. The app runs without a Resend key —
// every helper becomes a no-op that returns false so callers can audit "email
// not configured" without crashing. Real customers MUST configure both
// RESEND_API_KEY and RESEND_FROM_EMAIL with a verified sender domain; otherwise
// Resend only delivers to the account owner.
export interface EmailSendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

async function send(opts: { to: string; subject: string; html: string }): Promise<EmailSendResult> {
  if (!features.email) return { ok: false, error: "email_not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: opts.to, subject: opts.subject, html: opts.html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `resend_${res.status}: ${body.slice(0, 200)}` };
    }
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Back-compat wrapper retained for any direct callers; new code should use the
// typed helpers below.
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const r = await send(opts);
  return r.ok;
}

const shell = (inner: string) =>
  `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
    ${inner}
    <p style="color:#888;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:12px">Veryfi · interview-integrity verification.</p>
  </div>`;

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${href}" style="background:#4d8dff;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${label}</a></p>`;

export async function sendPasswordReset(to: string, resetUrl: string): Promise<EmailSendResult> {
  return send({
    to,
    subject: "Reset your Veryfi password",
    html: shell(
      `<h2 style="margin-top:0">Reset your password</h2>
       <p style="color:#444;line-height:1.5">We received a request to reset your Veryfi password. This link is valid for 1 hour and can be used once.</p>
       ${button(resetUrl, "Set a new password")}
       <p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    ),
  });
}

// Back-compat: keeps the older module-level helper signature alive for code
// paths that pre-date the typed API.
export function passwordResetEmail(link: string): { subject: string; html: string } {
  return {
    subject: "Reset your Veryfi password",
    html: shell(
      `<h2 style="margin-top:0">Reset your password</h2>
       <p style="color:#444;line-height:1.5">We received a request to reset your Veryfi password. This link is valid for 1 hour and can be used once.</p>
       ${button(link, "Set a new password")}
       <p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    ),
  };
}

export async function sendCandidateInvite(
  to: string,
  candidateName: string,
  verificationUrl: string,
  orgName: string,
): Promise<EmailSendResult> {
  return send({
    to,
    subject: `${orgName} requested a quick identity check`,
    html: shell(
      `<h2 style="margin-top:0">Hi ${escapeHtml(candidateName)},</h2>
       <p style="color:#444;line-height:1.5">${escapeHtml(orgName)} uses Veryfi to confirm interviews are with real, present candidates. It takes about 60 seconds: a government-ID check, a quick selfie, and a couple of on-camera prompts.</p>
       <p style="color:#444;line-height:1.5">Your link is private and expires soon — please complete the check before your next interview round.</p>
       ${button(verificationUrl, "Start the 60-second check")}
       <p style="color:#888;font-size:12px">Your camera footage stays on your device. Questions? Reply to this email.</p>`,
    ),
  });
}

export async function sendVerificationComplete(
  to: string,
  recruiterName: string,
  band: "pass" | "review" | "risk",
  verificationUrl: string,
): Promise<EmailSendResult> {
  const headline =
    band === "pass" ? "Verification complete — likely a real, present candidate"
    : band === "review" ? "Verification needs your review"
    : "Verification flagged: high fraud risk";
  return send({
    to,
    subject: `Veryfi result: ${headline}`,
    html: shell(
      `<h2 style="margin-top:0">Hi ${escapeHtml(recruiterName)},</h2>
       <p style="color:#444;line-height:1.5">A candidate just finished their Veryfi check. Verdict: <b>${headline}</b>.</p>
       ${button(verificationUrl, "Open the verification")}
       <p style="color:#888;font-size:12px">Veryfi reports signals, not decisions — the hiring call is always yours.</p>`,
    ),
  });
}

export async function sendEmailVerification(to: string, verifyUrl: string): Promise<EmailSendResult> {
  return send({
    to,
    subject: "Confirm your Veryfi email",
    html: shell(
      `<h2 style="margin-top:0">Confirm your email</h2>
       <p style="color:#444;line-height:1.5">Welcome to Veryfi. Tap the button to confirm this address is yours — the link is valid for 24 hours.</p>
       ${button(verifyUrl, "Confirm email")}
       <p style="color:#888;font-size:12px">Didn't sign up? You can safely ignore this email.</p>`,
    ),
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
