import { describe, it, expect, afterEach } from "vitest";
import { getEnv, isSeedDemoEnabled } from "../src/config/env";

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
      SEED_DEMO: "",
    });
  });

  it("returns configured values when present", () => {
    window.__HUMVAULT_ENV__ = {
      SENTRY_DSN: "https://example.ingest/123",
      UMAMI_WEBSITE_ID: "abc-123",
      UMAMI_URL: "https://analytics.example/script.js",
      SEED_DEMO: "1",
    };
    expect(getEnv()).toEqual({
      SENTRY_DSN: "https://example.ingest/123",
      UMAMI_WEBSITE_ID: "abc-123",
      UMAMI_URL: "https://analytics.example/script.js",
      SEED_DEMO: "1",
    });
  });

  it("trims and tolerates partial or malformed config without throwing", () => {
    window.__HUMVAULT_ENV__ = { SENTRY_DSN: "  spaced  " } as never;
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().SENTRY_DSN).toBe("spaced");
    expect(getEnv().UMAMI_URL).toBe("");
    expect(getEnv().SEED_DEMO).toBe("");
  });
});

describe("isSeedDemoEnabled", () => {
  it("is true for 1 and true in any case", () => {
    for (const value of ["1", "true", "TRUE", "True"]) {
      window.__HUMVAULT_ENV__ = { SEED_DEMO: value };
      expect(isSeedDemoEnabled()).toBe(true);
    }
  });

  it("is false for blank, unset, or other values", () => {
    delete window.__HUMVAULT_ENV__;
    expect(isSeedDemoEnabled()).toBe(false);
    for (const value of ["", "0", "false", "yes", "on"]) {
      window.__HUMVAULT_ENV__ = { SEED_DEMO: value };
      expect(isSeedDemoEnabled()).toBe(false);
    }
  });
});
