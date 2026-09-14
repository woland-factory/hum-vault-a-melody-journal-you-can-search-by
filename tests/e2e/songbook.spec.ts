import { test, expect } from "@playwright/test";

// The load-bearing durability proof: a hum saved from capture appears in the
// songbook and is still there after a full page reload. A reload reuses the
// same on-disk IndexedDB, so surviving a reload is the strongest proof the
// entry lives in storage, not memory. The pipeline is driven through the
// bundled example so the on-device model runs deterministically on CI.
test("save a hum, it survives reload, and opens to play at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  // Capture through the deterministic example path to a ready result.
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.locator('[data-testid="notation-paper"] svg')).toBeVisible({
    timeout: 90_000,
  });

  // Save to the songbook.
  const save = page.getByRole("button", { name: "Save to songbook" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Go to the songbook and confirm the entry is listed.
  await page.getByRole("button", { name: "View in songbook" }).click();
  await expect(page.getByRole("heading", { name: "Songbook" })).toBeVisible();
  const entryTitle = page.locator(".entry-row__title").first();
  await expect(entryTitle).toBeVisible();
  const title = (await entryTitle.textContent())?.trim() ?? "";
  expect(title.length).toBeGreaterThan(0);

  // No horizontal scroll at 390px.
  const songbookScroll = await page.evaluate(() => {
    const el = document.scrollingElement as Element;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(songbookScroll.scrollWidth).toBeLessThanOrEqual(songbookScroll.clientWidth + 1);

  // Reload: the entry must still be there (proves IndexedDB persistence).
  await page.reload();
  await expect(page.getByRole("heading", { name: "Songbook" })).toBeVisible();
  await expect(page.locator(".entry-row__title").first()).toHaveText(title);

  // Open the entry and confirm its detail renders with an enabled Play control.
  await page.locator(".entry-row__open").first().click();
  await expect(page.getByLabel("Title")).toHaveValue(title);
  await expect(page.locator('[data-testid="notation-paper"] svg')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();

  // No horizontal scroll on the detail screen at 390px.
  const detailScroll = await page.evaluate(() => {
    const el = document.scrollingElement as Element;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(detailScroll.scrollWidth).toBeLessThanOrEqual(detailScroll.clientWidth + 1);
});
