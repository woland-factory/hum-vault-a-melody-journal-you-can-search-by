import { getEnv } from "../config/env";

// Initialize Sentry only when a DSN is configured. No audio, note data, or
// other user content is ever sent. If the DSN is absent, the app runs normally.
export async function initSentry(): Promise<void> {
  const { SENTRY_DSN } = getEnv();
  if (!SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/browser");
    Sentry.init({
      dsn: SENTRY_DSN,
      // Keep breadcrumbs free of user content. We never attach audio or notes.
      beforeBreadcrumb: (crumb) => crumb,
      tracesSampleRate: 0,
    });
  } catch {
    // Telemetry must never break the app.
  }
}
