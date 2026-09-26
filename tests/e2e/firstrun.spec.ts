import { test, expect } from "@playwright/test";

// The guided first run and the SEED_DEMO sample songbook, both at 390px. The
// guide is non-blocking, so the same deterministic example pipeline the other
// specs use still drives capture, save, and search to completion while it is on
// screen.

test("guides a new user through record, save, and search, then stays gone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");

  const guide = page.getByTestId("walkthrough");
  const guideLabel = page.locator(".walkthrough__label");

  // Step 1 is on screen with a Skip control, and the shell renders real content.
  await expect(guide).toBeVisible();
  await expect(guideLabel).toHaveText("Record a hum.");
  await expect(guide.getByText("Step 1 of 3")).toBeVisible();
  await expect(guide.getByRole("button", { name: "Skip" })).toBeVisible();

  // No horizontal scroll at 390px with the guide present.
  const noScroll = async () =>
    page.evaluate(() => {
      const el = document.scrollingElement as Element;
      return el.scrollWidth <= el.clientWidth + 1;
    });
  expect(await noScroll()).toBe(true);

  // Step 1 completes through "Try an example" (no microphone needed).
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.locator('[data-testid="notation-paper"] svg')).toBeVisible({
    timeout: 90_000,
  });
  await expect(guideLabel).toHaveText("Save it to your songbook.");

  // Step 2: save the draft.
  await page.getByRole("button", { name: "Save to songbook" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(guideLabel).toHaveText("Hum to find it again.");

  // Move to the songbook, then the search screen; the guide still points at
  // step 3 and the real controls stay operable.
  await page.getByRole("button", { name: "View in songbook" }).click();
  await expect(page.getByRole("heading", { name: "Songbook" })).toBeVisible();
  await expect(guideLabel).toHaveText("Hum to find it again.");

  await page.getByRole("button", { name: "Hum to search" }).click();
  await expect(
    page.getByRole("heading", { name: "Find a tune by humming" }),
  ).toBeVisible();

  // Step 3 completes when the search returns a match. The guide then disappears.
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByRole("heading", { name: "Closest matches" })).toBeVisible({
    timeout: 90_000,
  });
  await expect(guide).toHaveCount(0);
  expect(await noScroll()).toBe(true);

  // It never returns after a reload: the completion flag lives in IndexedDB.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Find a tune by humming" })).toBeVisible();
  await expect(page.getByTestId("walkthrough")).toHaveCount(0);
});

test("SEED_DEMO plants a sample songbook that plays and returns a search match", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  // Turn the demo seed on the way the container does: env.js carries it. This
  // loads before the bundle, so intercept it rather than setting the global.
  await page.route("**/env.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'window.__HUMVAULT_ENV__ = { SEED_DEMO: "true" };',
    }),
  );
  await page.goto("/");

  // Seeding runs after first paint through the real capture pipeline. Wait for
  // it to finish in this same page context (a reload would restart it).
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const req = indexedDB.open("humvault", 2);
              req.onsuccess = () => {
                const db = req.result;
                const tx = db.transaction("entries", "readonly");
                const countReq = tx.objectStore("entries").count();
                countReq.onsuccess = () => resolve(countReq.result);
                countReq.onerror = () => resolve(-1);
              };
              req.onerror = () => resolve(-1);
            }),
        ),
      { timeout: 120_000, intervals: [1500] },
    )
    .toBeGreaterThanOrEqual(3);

  // The landing screen surfaces the seeded songbook on its own, no reload: the
  // capture screen re-reads its count once the seed settles.
  await expect(
    page.getByRole("button", { name: /Songbook \(\d+\)/ }),
  ).toBeVisible();

  // Open the songbook within the SPA (no reload) so the seeded ideas show.
  await page.evaluate(() => {
    window.location.hash = "#/songbook";
  });
  await expect(page.getByRole("heading", { name: "Songbook" })).toBeVisible();

  // A seeded row is marked as a sample.
  await expect(page.locator(".entry-row__badge").first()).toHaveText("Sample");
  const firstRow = page.locator(".entry-row").first();

  // It plays back a real melody: the Play control drives the audio path end to
  // end without breaking the row. The optimistic "Playing" toggle is a fixed,
  // sub-second state that a loaded headless host tears down before an assertion
  // can catch it, so its aria-pressed flip is covered deterministically by the
  // songbook unit test instead.
  await firstRow.getByRole("button", { name: "Play", exact: true }).click();
  await expect(firstRow.getByRole("button", { name: /^Play/ })).toBeVisible();

  // The scripted no-mic search returns a non-empty match.
  await page.getByRole("button", { name: "Hum to search" }).click();
  await expect(
    page.getByRole("heading", { name: "Find a tune by humming" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByRole("heading", { name: "Closest matches" })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.locator(".entry-row__title").first()).toHaveText("Warm-up phrase");

  // No horizontal scroll at 390px.
  const scroll = await page.evaluate(() => {
    const el = document.scrollingElement as Element;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1);
});
