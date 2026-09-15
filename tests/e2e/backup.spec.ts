import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Bulk import and vault backup, end to end at a 390px viewport. The bundled
// hum fixture runs through the real decode -> transcribe -> save pipeline, so
// an imported file lands as a searchable entry exactly like a live hum. Then
// the songbook-to-Settings-to-Export path (two taps) downloads a zip, and a
// FRESH browser context (empty IndexedDB) restores it faithfully; importing
// the same zip twice adds nothing.

const FIXTURE = fileURLToPath(
  new URL("../fixtures/simple-hum.wav", import.meta.url),
);

test("importing a voice memo file creates a songbook entry at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  // The idle capture screen offers the import affordance; recording stays
  // the primary action above it.
  await expect(page.getByText("Add from files")).toBeVisible();
  await page.setInputFiles('[data-testid="import-files"]', FIXTURE);

  // The per-file row appears immediately, then reaches Saved after on-device
  // transcription.
  await expect(page.getByText("simple-hum.wav")).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByText("Added 1 of 1.")).toBeVisible();

  // No horizontal scroll at 390px with the import list on screen.
  const scroll = await page.evaluate(() => {
    const el = document.scrollingElement as Element;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1);

  // The imported memo is a real songbook entry titled from its filename.
  await page.goto("/#/songbook");
  await expect(page.locator(".entry-row__title").first()).toHaveText("simple-hum");
});

test("two-tap export downloads a zip that restores in a fresh context without duplicates", async ({
  page,
  browser,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  // Seed the vault through the import pipeline.
  await page.setInputFiles('[data-testid="import-files"]', FIXTURE);
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({
    timeout: 90_000,
  });

  // Tap 1: Settings from the songbook. Tap 2: Export backup.
  await page.goto("/#/songbook");
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export backup" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^hum-vault-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  const zipPath = testInfo.outputPath("backup.zip");
  await download.saveAs(zipPath);
  await expect(page.getByText("Backup downloaded.")).toBeVisible();

  // A fresh context has an empty IndexedDB: the backup restores the entry.
  const fresh = await browser.newContext();
  try {
    const restored = await fresh.newPage();
    await restored.setViewportSize({ width: 390, height: 800 });
    await restored.goto("/#/settings");
    await restored.setInputFiles('[data-testid="import-backup"]', zipPath);
    await expect(restored.getByText("Restored 1. Skipped 0.")).toBeVisible({
      timeout: 30_000,
    });

    // Importing the same zip again adds nothing.
    await restored.setInputFiles('[data-testid="import-backup"]', zipPath);
    await expect(restored.getByText("Restored 0. Skipped 1.")).toBeVisible({
      timeout: 30_000,
    });

    // Exactly one row, faithful title.
    await restored.goto("/#/songbook");
    await expect(restored.locator(".entry-row")).toHaveCount(1);
    await expect(restored.locator(".entry-row__title")).toHaveText("simple-hum");
  } finally {
    await fresh.close();
  }
});
