import { test, expect } from "@playwright/test";

// The signature end-to-end proof: save a hum, then find it again by humming.
// The pipeline is driven through the bundled example on both capture and search
// so the on-device model runs deterministically on a shared CI host. Because
// the search query is the SAME example melody as the saved entry, that entry
// must come back as the top match. Runs at a 390px viewport.
test("hum to search returns the saved idea, which plays and opens, at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  // Capture through the deterministic example path and save, so the corpus is
  // non-empty.
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.locator('[data-testid="notation-paper"] svg')).toBeVisible({
    timeout: 90_000,
  });
  const save = page.getByRole("button", { name: "Save to songbook" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // Go to the songbook, then tap Hum to search (the primary action there).
  await page.getByRole("button", { name: "View in songbook" }).click();
  await expect(page.getByRole("heading", { name: "Songbook" })).toBeVisible();
  const savedTitle =
    (await page.locator(".entry-row__title").first().textContent())?.trim() ?? "";
  expect(savedTitle.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Hum to search" }).click();
  await expect(page.getByRole("heading", { name: "Find a tune by humming" })).toBeVisible();

  // Run a query through the same deterministic example path.
  await page.getByRole("button", { name: "Try an example" }).click();

  // The same melody comes back as the top (only) match.
  await expect(page.getByRole("heading", { name: "Closest matches" })).toBeVisible({
    timeout: 90_000,
  });
  const topResult = page.locator(".entry-row__title").first();
  await expect(topResult).toHaveText(savedTitle);

  // No horizontal scroll at 390px on the results screen.
  const scroll = await page.evaluate(() => {
    const el = document.scrollingElement as Element;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1);

  // Play the top result: its control reflects the active/playing state.
  const resultRow = page.locator(".entry-row").first();
  await resultRow.getByRole("button", { name: "Play", exact: true }).click();
  await expect(resultRow.getByRole("button", { name: "Playing" })).toBeVisible();

  // Open the result and confirm its detail renders.
  await page.locator(".entry-row__open").first().click();
  await expect(page.getByLabel("Title")).toHaveValue(savedTitle);
  await expect(page.locator('[data-testid="notation-paper"] svg')).toBeVisible({
    timeout: 30_000,
  });
});
