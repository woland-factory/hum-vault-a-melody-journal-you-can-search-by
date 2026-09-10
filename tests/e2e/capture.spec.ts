import { test, expect } from "@playwright/test";

// Proves the first minute of value at a 390px viewport: the shell renders real
// content on load, and the identical decode -> transcribe -> notation ->
// playback pipeline yields draft notation plus a playable control. The pipeline
// is driven through the bundled example so the on-device model runs
// deterministically on a shared CI host (the record path uses the same code).
test("hum to draft notation and playback at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  // Real content on first paint.
  await expect(page.getByRole("heading", { name: "Hum Vault" })).toBeVisible();
  await expect(
    page.getByText("Your audio stays on this device", { exact: false }),
  ).toBeVisible();
  const record = page.getByRole("button", { name: /Record a hum/ });
  await expect(record).toBeVisible();

  // No horizontal scroll at 390px.
  const { scrollWidth, clientWidth } = await page.evaluate(() => {
    const el = document.scrollingElement as Element;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Run the full pipeline through the one-tap example.
  await page.getByRole("button", { name: "Try an example" }).click();

  // Draft notation is rendered by abcjs (an SVG in the notation paper).
  const svg = page.locator('[data-testid="notation-paper"] svg');
  await expect(svg).toBeVisible({ timeout: 90_000 });

  // A Play control is present and enabled.
  const play = page.getByRole("button", { name: "Play", exact: true });
  await expect(play).toBeEnabled();

  // Still no horizontal scroll once the result is on screen.
  const after = await page.evaluate(() => {
    const el = document.scrollingElement as Element;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(after.scrollWidth).toBeLessThanOrEqual(after.clientWidth + 1);
});
