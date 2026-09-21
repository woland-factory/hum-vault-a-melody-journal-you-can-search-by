// Runtime configuration. Values arrive from window.__HUMVAULT_ENV__, which the
// container entrypoint writes from environment variables at start. Nothing is
// baked into the bundle, and reads never throw when a value is missing.

export interface RuntimeEnv {
  SENTRY_DSN: string;
  UMAMI_WEBSITE_ID: string;
  UMAMI_URL: string;
  SEED_DEMO: string;
}

declare global {
  interface Window {
    __HUMVAULT_ENV__?: Partial<RuntimeEnv>;
  }
}

export function getEnv(): RuntimeEnv {
  const raw =
    typeof window !== "undefined" && window.__HUMVAULT_ENV__
      ? window.__HUMVAULT_ENV__
      : {};
  return {
    SENTRY_DSN: str(raw.SENTRY_DSN),
    UMAMI_WEBSITE_ID: str(raw.UMAMI_WEBSITE_ID),
    UMAMI_URL: str(raw.UMAMI_URL),
    SEED_DEMO: str(raw.SEED_DEMO),
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * True when the staging demo seed is switched on. Accepts "1" or "true" in any
 * case; anything else (blank, unset, other) is off. Off by default so
 * production never seeds.
 */
export function isSeedDemoEnabled(): boolean {
  const value = getEnv().SEED_DEMO.toLowerCase();
  return value === "1" || value === "true";
}
