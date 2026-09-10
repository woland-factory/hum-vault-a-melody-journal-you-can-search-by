import { getEnv } from "../config/env";

// Inject the Umami analytics tag only when both the website id and script URL
// are configured. Otherwise do nothing. Umami is cookieless and collects no
// personal data.
export function initAnalytics(): HTMLScriptElement | null {
  const { UMAMI_WEBSITE_ID, UMAMI_URL } = getEnv();
  if (!UMAMI_WEBSITE_ID || !UMAMI_URL) return null;
  if (typeof document === "undefined") return null;

  const existing = document.querySelector<HTMLScriptElement>(
    'script[data-humvault-umami="1"]',
  );
  if (existing) return existing;

  const script = document.createElement("script");
  script.defer = true;
  script.src = UMAMI_URL;
  script.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
  script.setAttribute("data-humvault-umami", "1");
  document.head.appendChild(script);
  return script;
}
