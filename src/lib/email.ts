import { env, features } from "./env";

// Minimal transactional email via Resend (https://resend.com — free tier, no SDK
// needed, just a REST call). Optional: when RESEND_API_KEY isn't set, send() is a
// no-op that returns false so callers can surface "email not configured".
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!features.email) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html }),
      signal: AbortSignal.timeout(10000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function passwordResetEmail(link: string): { subject: string; html: string } {
  return {
    subject: "Reset your Orbyt Verify password",
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#111">Reset your password</h2>
      <p style="color:#444;line-height:1.5">We received a request to reset your Orbyt Verify password. This link is valid for 1 hour and can be used once.</p>
      <p style="margin:24px 0"><a href="${link}" style="background:#4d8dff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Set a new password</a></p>
      <p style="color:#888;font-size:12px">If you didn't request this, you can safely ignore this email — your password won't change.</p>
    </div>`,
  };
}
