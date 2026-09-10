import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const initMock = vi.fn();
vi.mock("@sentry/browser", () => ({
  init: (...args: unknown[]) => initMock(...args),
}));

import { initSentry } from "../src/telemetry/sentry";
import { initAnalytics } from "../src/telemetry/analytics";

beforeEach(() => {
  initMock.mockClear();
  delete window.__HUMVAULT_ENV__;
  document.head.querySelectorAll('script[data-humvault-umami="1"]').forEach((n) => n.remove());
});

afterEach(() => {
  delete window.__HUMVAULT_ENV__;
});

describe("Sentry", () => {
  it("does not initialize when no DSN is set", async () => {
    await initSentry();
    expect(initMock).not.toHaveBeenCalled();
  });

  it("initializes only when a DSN is set", async () => {
    window.__HUMVAULT_ENV__ = { SENTRY_DSN: "https://example.ingest/1" };
    await initSentry();
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock.mock.calls[0][0]).toMatchObject({
      dsn: "https://example.ingest/1",
    });
  });
});

describe("Umami analytics", () => {
  it("injects nothing when the vars are absent", () => {
    const el = initAnalytics();
    expect(el).toBeNull();
    expect(document.querySelector('script[data-humvault-umami="1"]')).toBeNull();
  });

  it("injects nothing when only one var is set", () => {
    window.__HUMVAULT_ENV__ = { UMAMI_WEBSITE_ID: "abc" };
    expect(initAnalytics()).toBeNull();
  });

  it("injects the tag when both id and url are set", () => {
    window.__HUMVAULT_ENV__ = {
      UMAMI_WEBSITE_ID: "abc-123",
      UMAMI_URL: "https://analytics.example/s.js",
    };
    const el = initAnalytics();
    expect(el).not.toBeNull();
    expect(el?.src).toBe("https://analytics.example/s.js");
    expect(el?.getAttribute("data-website-id")).toBe("abc-123");
    expect(el?.defer).toBe(true);
  });
});
