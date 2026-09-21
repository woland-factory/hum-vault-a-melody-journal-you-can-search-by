import { test, expect, type Page } from "@playwright/test";
import { computeContour } from "../../src/melody/contour";
import type { NoteEvent } from "../../src/transcribe/types";

// Runs under the mobile-safari (WebKit) project only, at the iPhone 390px
// viewport. WebKit is the engine mobile Safari uses, so this is the CI-provable
// proxy for "works on an iPhone". A real iOS-device microphone pass is
// documented in VERIFICATION.md (the one step outside CI).
//
// Chosen split (per the EPIC's T1 rationale):
//   * Proven here on the WebKit engine: capture-to-notation through the model
//     (basic-pitch via onnxruntime-web WASM runs under WebKit), the songbook
//     list, and hum-to-search returning a ranked result. All at 390px with no
//     horizontal scroll.
//   * The search corpus is SEEDED straight into IndexedDB rather than saved
//     through the live pipeline, because headless WebKit in the Playwright
//     container cannot persist a Blob to IndexedDB (a known WebKit/Playwright
//     limitation, not an app bug: real iOS Safari over HTTPS persists fine, and
//     the manual VERIFICATION.md pass confirms it). So the Blob-persistence
//     flows (live save, bulk import, backup export) stay proven under the
//     desktop (Chromium) project, which drives the full pipeline end to end.
//
// The seeded corpus includes the exact melody the bundled example plays
// (C D E G E C), so "Try an example" transcribes that clip on WebKit and ranks
// the seeded entry back, proving the differentiator on the WebKit engine.

function notesOf(pitches: number[]): NoteEvent[] {
  return pitches.map((pitchMidi, i) => ({
    pitchMidi,
    startSec: i * 0.5,
    durationSec: 0.5,
  }));
}

// The exact on-device transcription of public/example-hum.wav (basic-pitch is
// deterministic for a fixed clip and pinned model: it adds a leading octave
// blip and doubles the held notes). Seeding this makes the WebKit "Try an
// example" query match the seeded entry at distance ~0, so the ranked result
// is guaranteed without persisting the clip through the live save path.
const EXAMPLE_NOTES: NoteEvent[] = [
  { pitchMidi: 72, startSec: 0.0116, durationSec: 0.0697 },
  { pitchMidi: 60, startSec: 0.4876, durationSec: 0.0813 },
  { pitchMidi: 62, startSec: 0.6385, durationSec: 0.476 },
  { pitchMidi: 62, startSec: 1.1146, durationSec: 0.0929 },
  { pitchMidi: 64, startSec: 1.2539, durationSec: 0.4992 },
  { pitchMidi: 64, startSec: 1.7531, durationSec: 0.0929 },
  { pitchMidi: 67, startSec: 1.904, durationSec: 0.605 },
  { pitchMidi: 64, startSec: 2.5671, durationSec: 0.4876 },
  { pitchMidi: 64, startSec: 3.0547, durationSec: 0.0929 },
  { pitchMidi: 60, startSec: 3.2056, durationSec: 0.5921 },
  { pitchMidi: 60, startSec: 3.7977, durationSec: 0.0929 },
];

// Plain, JSON-serializable entries. Audio is filled with a tiny ArrayBuffer
// inside the browser (a Blob would not persist under headless WebKit; the
// songbook and search never read audio anyway).
const SEED = [
  { id: "seed-example", title: "Warm-up phrase", notes: EXAMPLE_NOTES, abc: "X:1\nK:C\nCDEG EC\n" },
  { id: "seed-descending", title: "Coming down", notes: notesOf([79, 77, 76, 74, 72, 71]), abc: "X:1\nK:C\ngfed c B\n" },
  { id: "seed-arp", title: "Broken chord", notes: notesOf([60, 64, 67, 72, 67, 64]), abc: "X:1\nK:C\nCEGc GE\n" },
].map((s, i) => ({
  id: s.id,
  title: s.title,
  createdAt: 1_700_000_000_000 + i,
  updatedAt: 1_700_000_000_000 + i,
  notes: s.notes,
  contour: computeContour(s.notes),
  notationAbc: s.abc,
  tags: [] as string[],
  schemaVersion: 1,
}));

async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.scrollingElement as Element;
    return el.scrollWidth <= el.clientWidth + 1;
  });
}

async function seedCorpus(page: Page, entries: unknown[]): Promise<void> {
  await page.evaluate(async (seed) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("humvault", 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("entries")) {
          const store = db.createObjectStore("entries", { keyPath: "id" });
          store.createIndex("byCreatedAt", "createdAt", { unique: false });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("entries", "readwrite");
        const store = tx.objectStore("entries");
        for (const entry of seed as Record<string, unknown>[]) {
          store.put({
            ...entry,
            audio: new Uint8Array([1, 2, 3]).buffer,
            audioMimeType: "audio/webm",
            durationSec: 3,
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("abort"));
      };
      req.onerror = () => reject(req.error);
    });
  }, entries);
}

test("transcribes the example to notation on WebKit at 390px", async ({ page }) => {
  await page.goto("/");
  expect(await noHorizontalScroll(page)).toBe(true);

  // The on-device model runs under WebKit: the example clip becomes notation.
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.locator('[data-testid="notation-paper"] svg')).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByRole("button", { name: "Save to songbook" })).toBeVisible();
  expect(await noHorizontalScroll(page)).toBe(true);
});

test("lists a seeded songbook and returns a hum-to-search match on WebKit at 390px", async ({
  page,
}) => {
  await page.goto("/");
  await seedCorpus(page, SEED);

  // Songbook lists the seeded ideas with no horizontal scroll.
  await page.goto("/#/songbook");
  await expect(page.getByRole("heading", { name: "Songbook" })).toBeVisible();
  await expect(page.locator(".entry-row")).toHaveCount(SEED.length);
  expect(await noHorizontalScroll(page)).toBe(true);

  // Hum to search: the example clip is transcribed on WebKit and ranked against
  // the seeded corpus, returning the matching idea.
  await page.getByRole("button", { name: "Hum to search" }).click();
  await expect(
    page.getByRole("heading", { name: "Find a tune by humming" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByRole("heading", { name: "Closest matches" })).toBeVisible({
    timeout: 90_000,
  });
  // The seeded entry that matches the example ranks first.
  await expect(page.locator(".entry-row__title").first()).toHaveText("Warm-up phrase");
  expect(await noHorizontalScroll(page)).toBe(true);
});
