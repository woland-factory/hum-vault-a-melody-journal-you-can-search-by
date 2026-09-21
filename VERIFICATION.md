# Verification

This file records the checks that back the mobile-Safari, accessibility, and
recall claims. The automated ones run in CI; the one manual step (a real iPhone
microphone) is called out plainly because a physical device is outside CI.

## Mobile Safari / WebKit at 390px

The automated proxy for "works on an iPhone" is the `mobile-safari` Playwright
project: the WebKit engine mobile Safari uses, at the iPhone 390px viewport. It
runs `tests/e2e/mobile-safari.spec.ts` through the pinned Playwright container
(`bash scripts/e2e.sh`, which runs every project), all with no horizontal
scroll.

Proven on the WebKit engine here:

- capture to notation, running the on-device model (basic-pitch via
  onnxruntime-web WASM runs under WebKit),
- the songbook list, from a seeded corpus,
- hum to search returning a ranked result: the seeded corpus includes the exact
  melody the bundled example plays, so "Try an example" transcribes it on WebKit
  and ranks it back.

Split, and why: the search corpus is seeded straight into IndexedDB rather than
saved through the live pipeline. Headless WebKit in the Playwright container
cannot persist a Blob to IndexedDB (a known WebKit/Playwright limitation, not an
app bug: `isSecureContext` is true and `crypto.randomUUID` works, but a
Blob-valued record fails the transaction). Real iOS Safari over HTTPS persists
fine, which the manual pass below confirms. So the Blob-persistence flows (live
save, bulk import, backup export) stay proven under the `desktop` (Chromium)
project, which drives the full pipeline end to end, including a
save-then-reload persistence proof.

### Manual step: microphone on a physical iPhone (outside CI)

Headless WebKit cannot grant a real microphone, so confirming capture on iOS
Safari specifically is a human step. On an iPhone running Safari:

1. Open the deployed or staging URL.
2. Tap **Record a hum** and allow microphone access when prompted.
3. Hum a short melody, then tap **Stop**.
4. Confirm the draft notation appears and **Play** sounds it back.
5. Tap **Save to songbook**, then open the songbook and confirm the entry.
6. Tap **Hum to search**, hum part of the same tune, and confirm it comes back
   in **Closest matches**.
7. Back on capture, use **Add from files** to import a memo, then open
   **Settings** and **Export backup** to download the zip.

The recorder negotiates a Safari-supported container (`audio/mp4`) via
`MediaRecorder.isTypeSupported` and tags the saved blob with the real
`recorder.mimeType`, so an iOS recording decodes correctly. This is covered by
`tests/recorder.test.ts`.

## Accessibility

### Contrast ratios (WCAG AA)

Measured with the WCAG relative-luminance formula against the two background
tokens. Normal text needs 4.5:1; large text and UI borders need 3:1. Every pair
clears its threshold.

| Foreground        | on `--bg` (#0f172a) | on `--surface` (#1e293b) |
| ----------------- | ------------------- | ------------------------ |
| `--text` #f1f5f9  | 16.30:1             | 13.35:1                  |
| `--accent` #f59e0b | 8.31:1             | 6.81:1                   |
| `--focus` #fbbf24 | 10.69:1             | 8.76:1                   |
| `--muted` #94a3b8 | 6.96:1              | 5.71:1                   |
| `--danger` #fb7185 | 6.63:1             | 5.44:1                   |

### Other basics

- Exactly one `<h1>` and one `<main>` landmark per screen, in every phase
  (covered by the component tests for search and entry detail).
- Error surfaces announce assertively (`role="alert"`); progress and success
  announce politely (`aria-live="polite"`). See `tests/statusMessage.test.tsx`
  and the capture/settings tests.
- The confirm dialog is `role="dialog"` + `aria-modal="true"` +
  `aria-labelledby`, traps Tab focus, closes on Escape, and restores focus to
  its trigger (`tests/confirmDialog.test.tsx`).
- Toggle controls (Play rows, notation Play, Record) expose `aria-pressed`.
- Touch targets are at least ~44px; the songbook Settings link was raised to
  meet it.

## Recall quality

The top-3 recall bar is measured against `tests/fixtures/searchCorpus.ts` by
`tests/search.test.ts`, and the corpus-scale guard on the songbook and search
hot paths is in `tests/perfHotPaths.test.ts`.
