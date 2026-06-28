import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? "";

// Strips obvious PII out of request bodies/headers BEFORE they ship to Sentry.
// We never want candidate names/emails, ID tokens, or password fields in
// breadcrumbs. URL path tokens (32+ char base64url segments) get redacted too
// since candidate links carry one as part of the path.
const PII_KEY = /email|name|ssn|token|password|secret|signature|cookie|authorization/i;
const TOKEN_SEGMENT = /\b[A-Za-z0-9_-]{32,}\b/g;

function scrubObject(obj: unknown): unknown {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(scrubObject);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (PII_KEY.test(k)) out[k] = "[redacted]";
    else out[k] = scrubObject(v);
  }
  return out;
}

function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(TOKEN_SEGMENT, "[redacted]");
}

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    debug: false,
    beforeSend(event) {
      if (event.request) {
        if (event.request.data) event.request.data = scrubObject(event.request.data) as typeof event.request.data;
        if (event.request.headers) event.request.headers = scrubObject(event.request.headers) as typeof event.request.headers;
        if (event.request.cookies) event.request.cookies = scrubObject(event.request.cookies) as typeof event.request.cookies;
        if (event.request.url) event.request.url = redactUrl(event.request.url);
        if (event.request.query_string && typeof event.request.query_string === "string") {
          event.request.query_string = event.request.query_string.replace(TOKEN_SEGMENT, "[redacted]");
        }
      }
      if (event.user) {
        // Never associate events with PII identifiers.
        event.user = { id: event.user.id };
      }
      return event;
    },
  });
}
