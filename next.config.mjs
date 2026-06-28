/** @type {import('next').NextConfig} */

// Security headers (OWASP baseline). Notes on the deliberate exceptions:
// - CSP allows 'unsafe-inline'/'unsafe-eval' script + blob: worker because the
//   on-device liveness uses MediaPipe WASM loaded from jsdelivr; tighten with
//   nonces once Next.js inline-script nonce support is wired.
// - frame-src allows the IDV vendors (Didit / Stripe Identity) which render in an
//   iframe on the candidate page. Everything else may not frame us (frame-ancestors
//   'none' + X-Frame-Options DENY).
// - Permissions-Policy grants camera/microphone only to this origin (candidate
//   liveness) and the IDV vendor iframes; geolocation/payment are denied outright.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob:",
      "connect-src 'self' https://cdn.jsdelivr.net https://storage.googleapis.com https://*.supabase.co",
      "frame-src https://verification.didit.me https://verify.stripe.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: 'camera=(self "https://verification.didit.me" "https://verify.stripe.com"), microphone=(self "https://verification.didit.me" "https://verify.stripe.com"), geolocation=(), payment=()',
  },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

// Wrap with Sentry. The wrapper is a no-op when SENTRY_DSN/SENTRY_ORG/SENTRY_PROJECT
// are unset, so local dev (and any deploy without monitoring configured) stays clean.
async function withSentry(config) {
  if (!process.env.SENTRY_DSN) return config;
  const { withSentryConfig } = await import("@sentry/nextjs");
  return withSentryConfig(config, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: true,
    disableLogger: true,
    automaticVercelMonitors: false,
  });
}

export default await withSentry(nextConfig);
