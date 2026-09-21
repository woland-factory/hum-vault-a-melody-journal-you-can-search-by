import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 1, // sanctioned shared-host allowance
  timeout: 120_000, // model load + on-device inference headroom
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
  },
  webServer: {
    // Production build served by vite preview, never a dev server.
    command: `npm run build && npm run preview -- --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { NODE_OPTIONS: "--max-old-space-size=2048" },
  },
  projects: [
    {
      name: "desktop",
      // Chromium runs the full model pipeline via the fake media stream. These
      // launch args are Chromium-only, so they stay scoped to this project and
      // never reach WebKit.
      testIgnore: /mobile-safari\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--no-sandbox",
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
    },
    {
      // The WebKit engine mobile Safari uses, at the iPhone 390px viewport. This
      // is the CI-provable proxy for "works on an iPhone"; a real-device mic
      // pass is documented in VERIFICATION.md. Only the mobile-safari spec runs
      // here so the Chromium-only specs are not forced onto WebKit.
      name: "mobile-safari",
      testMatch: /mobile-safari\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
  ],
});
