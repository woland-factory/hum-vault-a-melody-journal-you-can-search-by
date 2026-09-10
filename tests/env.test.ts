import { describe, it, expect, afterEach } from "vitest";
import { getEnv } from "../src/config/env";

afterEach(() => {
  delete window.__HUMVAULT_ENV__;
});

describe("getEnv", () => {
  it("returns safe empty defaults when nothing is configured", () => {
    delete window.__HUMVAULT_ENV__;
    expect(getEnv()).toEqual({
      SENTRY_DSN: "",
      UMAMI_WEBSITE_ID: "",
      UMAMI_URL: "",
    });
  });

  it("returns configured values when present", () => {
    window.__HUMVAULT_ENV__ = {
      SENTRY_DSN: "https://example.ingest/123",
      UMAMI_WEBSITE_ID: "abc-123",
      UMAMI_URL: "https://analytics.example/script.js",
    };
    expect(getEnv()).toEqual({
      SENTRY_DSN: "https://example.ingest/123",
      UMAMI_WEBSITE_ID: "abc-123",
      UMAMI_URL: "https://analytics.example/script.js",
    });
  });

  it("trims and tolerates partial or malformed config without throwing", () => {
    window.__HUMVAULT_ENV__ = { SENTRY_DSN: "  spaced  " } as never;
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().SENTRY_DSN).toBe("spaced");
    expect(getEnv().UMAMI_URL).toBe("");
  });
});
