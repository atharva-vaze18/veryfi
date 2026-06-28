import * as Sentry from "@sentry/nextjs";

// Lightweight wrapper for third-party provider calls. Adds a Sentry span around
// the work so latency + failure rate are visible per-provider, and tags the
// span with provider/operation. No-op (zero overhead) when Sentry DSN is unset.
export async function traced<T>(
  category: "ipintel" | "emailrisk" | "identity" | "deepfake" | "webhook",
  operation: string,
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.withScope(async (scope) => {
    scope.setTag("provider_category", category);
    scope.setTag("provider_operation", operation);
    try {
      return await Sentry.startSpan(
        { name: `${category}.${operation}`, op: "http.client" },
        () => fn(),
      );
    } catch (e) {
      Sentry.captureException(e, { tags: { provider_category: category, provider_operation: operation } });
      throw e;
    }
  });
}

export { Sentry };
