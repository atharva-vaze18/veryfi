import "dotenv/config";

// Central config + feature flags. The app runs with zero keys; flags only decide
// which REAL detections are active vs reported as "not evaluated".
export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "file:./dev.db",
  JWT_SECRET: process.env.JWT_SECRET ?? "dev-only-change-me-please-set-a-real-secret-0000000000000000",
  APP_URL: process.env.APP_URL ?? "http://localhost:3100",
  IPQS_API_KEY: process.env.IPQS_API_KEY ?? "",
  PROXYCHECK_API_KEY: process.env.PROXYCHECK_API_KEY ?? "",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  // Subscription billing (e-commerce). Recurring Stripe Price ids per plan.
  STRIPE_PRICE_STARTER: process.env.STRIPE_PRICE_STARTER ?? "",
  STRIPE_PRICE_SCALE: process.env.STRIPE_PRICE_SCALE ?? "",
  SALES_EMAIL: process.env.SALES_EMAIL ?? "sales@orbyt.io",
  DIDIT_API_KEY: process.env.DIDIT_API_KEY ?? "",
  DIDIT_WORKFLOW_ID: process.env.DIDIT_WORKFLOW_ID ?? "",
  REALITY_DEFENDER_API_KEY: process.env.REALITY_DEFENDER_API_KEY ?? "",
  BIOMETRIC_RETENTION_DAYS: Number(process.env.BIOMETRIC_RETENTION_DAYS ?? "30"),
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  // How long the submit handler waits for deepfake analysis before degrading it to
  // "not evaluated". Default is tuned for Vercel's FREE (Hobby) function budget so
  // the candidate submit always returns. On Vercel Pro, raise this to ~45000 and
  // bump `maxDuration` in the submit route to 60 to let Reality Defender finish.
  DEEPFAKE_TIMEOUT_MS: Number(process.env.DEEPFAKE_TIMEOUT_MS ?? "8000"),
  // Super-admin: this account always has owner powers, unlimited quota, and can't
  // be removed or walled. Comma-separated emails; defaults to the founder.
  SUPERADMIN_EMAILS: (process.env.SUPERADMIN_EMAILS ?? "vaze.atharva18@gmail.com").toLowerCase(),
  // Transactional email (password reset, candidate invite, recruiter notification).
  // Resend (https://resend.com) — free tier. Set RESEND_FROM_EMAIL to an address on
  // a domain you've verified in the Resend dashboard, e.g. noreply@veryfi.co.
  // EMAIL_FROM is kept as a back-compat alias of RESEND_FROM_EMAIL.
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM ?? "Veryfi <onboarding@resend.dev>",
  EMAIL_FROM: process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM ?? "Veryfi <onboarding@resend.dev>",
};

export const features = {
  proxycheck: env.PROXYCHECK_API_KEY.length > 0, // real VPN/proxy/datacenter (friendly free tier)
  ipqs: env.IPQS_API_KEY.length > 0, // real VPN/proxy/datacenter detection
  // ID verification: Didit (free) takes priority over Stripe when both are set.
  didit: env.DIDIT_API_KEY.length > 0 && env.DIDIT_WORKFLOW_ID.length > 0, // real ID + selfie + liveness (free)
  stripeIdentity: env.STRIPE_SECRET_KEY.length > 0, // real ID + selfie + liveness (~$1.50)
  realityDefender: env.REALITY_DEFENDER_API_KEY.length > 0, // real deepfake content scoring
  // Usage metering is ALWAYS on — every org has a monthly quota that is tracked and
  // enforced regardless of Stripe (the tier wall works out of the box).
  // Stripe only gates self-serve UPGRADES (paying to raise the quota).
  stripeBilling: env.STRIPE_SECRET_KEY.length > 0 && (env.STRIPE_PRICE_STARTER.length > 0 || env.STRIPE_PRICE_SCALE.length > 0),
  email: env.RESEND_API_KEY.length > 0,
};

const SUPERADMINS = new Set(env.SUPERADMIN_EMAILS.split(",").map((e) => e.trim()).filter(Boolean));
export function isSuperAdmin(email: string | null | undefined): boolean {
  return !!email && SUPERADMINS.has(email.toLowerCase());
}
