import * as Sentry from "@sentry/nextjs";

// Browser-side Sentry. Only initialized if a DSN is configured — otherwise the
// SDK silently no-ops so local dev stays clean. Tracing is sampled to 10% to
// keep costs predictable.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    debug: false,
  });
}
