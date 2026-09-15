# EPIC SPEC: Bulk import and vault backup

## Quality differentiator (this app must win here)

**Recall of your own past ideas by ear.** Every other tool converts a hum
once and forgets it, or keeps recordings you can only find by name. Hum Vault
is the one place where a half-remembered fragment, hummed, returns the exact
idea.

**What this EPIC owes the differentiator:** the recall mechanic is only as
valuable as the corpus behind it. This EPIC feeds and protects that corpus. It
fills it fast (drop a pile of old voice memos and every one becomes a searchable
entry) and it makes the corpus durable (a full backup the user can carry off the
device and restore intact). An imported memo must land as a fully-formed entry
whose contour is computed exactly as a live hum's is, so search treats imported
ideas and hummed ideas identically. A restored backup must recompute contours
the same way, so a round-trip never degrades what search can find.

---

## Scope

### In scope

1. **Bulk import of audio files.** Drag one or more voice-memo files onto the
   app (desktop) or pick them with a file input (mobile and desktop). Each file
   is validated, decoded, transcribed, melody-indexed, and saved as an entry,
   entirely on-device, with visible per-file progress. One file failing does not
   abort the batch.
2. **Boundary validation of imported audio.** Type and size are checked before
   any decode work. Unsupported or oversized files get a clear per-file message
   and are skipped; the rest of the batch proceeds.
3. **Full vault export.** A single downloadable `.zip` containing, per entry,
   the original audio, a MusicXML file, and a MIDI file, plus a `manifest.json`
   carrying titles, tags, and timestamps (and the data needed for faithful
   re-import).
4. **Vault re-import.** Selecting an exported `.zip` restores its entries
   faithfully (notes, contour, tags, notation, audio, title, timestamps).
   Re-importing the same zip does not create duplicates.
5. **Settings surface.** A new Settings screen shows storage usage and hosts
   Export and Import. Export is reachable in two taps from the songbook.
6. **Copy + README.** Every new user-visible string lives in `src/copy/strings.ts`
   and passes the copy sweep. The README documents import and backup/restore.

### Out of scope (binding non-goals)

- **Cloud sync** — no network calls for any of this. Everything stays on-device.
- **Sharing links** — no shareable URLs, no export-to-a-service.
- **Server-side storage** — no backend, no upload. The app remains client-only.
- **Requesting persistent-storage permission** (`navigator.storage.persist()`),
  eviction warnings, auto-backup, or scheduled backup. Showing usage and making
  export easy is the durability promise for v1; anything beyond that is deferred.
- **Editing during import** (renaming/tagging mid-batch), import from cloud
  drives, or format conversion of the exported audio. Imported entries get a
  sensible default title (the filename) and can be edited later in entry detail,
  which already exists.
- **A first-run walkthrough for these surfaces.** The core-action onboarding
  belongs to the capture/search EPICs. This EPIC only ensures the import and
  backup surfaces have clear empty/loading/error states and a discoverable entry
  point. Do not build a guided multi-step tour here.

---

## Technical design

The app is a client-only React + Vite + TypeScript SPA. State lives in IndexedDB
via `src/db/entries.ts` (schema in `src/db/schema.ts`). There is no server and no
authenticated route. This EPIC adds no server and no network I/O.

### New dependency

Add **`fflate`** (`^0.8.x`) as a runtime `dependency`. It is a tiny (~8 KB),
zero-dependency zip/unzip library that runs in the browser and in Node/jsdom
(so unit tests can round-trip without a browser). Use its async `zip` / `unzip`
(or sync `zipSync` / `unzipSync` in tests) APIs.

Do NOT add a MIDI or MusicXML library. Both formats are generated deterministically
by small pure modules (below), which keeps them unit-testable and dependency-free.

### Data model

**No schema change and no DB version bump.** The existing `Entry` shape already
carries everything export needs and import restores: `id`, `title`, `createdAt`,
`updatedAt`, `audio` (Blob), `audioMimeType`, `durationSec`, `notes`, `contour`,
`notationAbc`, `tags`, `schemaVersion`. Export and import operate on the existing
v1 store. The forward-only migration policy in `src/db/schema.ts` is unchanged.

**Source of truth for derived files.** MusicXML and MIDI are derived from an
entry's `notes` (the transcription), the same source `computeContour` and the
draft ABC come from. Rationale: `notes` is always present, deterministic, and is
the canonical melodic content; the ABC draft is a rendering of it and may hold
hand tweaks that do not map cleanly to a score or a MIDI file. Deriving from
`notes` keeps both exporters pure and unit-testable. `notationAbc` is still
preserved verbatim in the manifest so hand edits survive a round-trip.

**Contour on import is recomputed, not trusted.** Import reconstructs each
entry's contour with `computeContour(notes)` rather than trusting the manifest's
copy. Because `computeContour` is deterministic and `CONTOUR_VERSION` is stable,
the recomputed contour equals the exported one, so restore is faithful, and a
tampered or stale manifest can never inject a bad index.

### Files / modules to touch

**New modules**

- `src/import/validateAudioFile.ts`
  - `export const ACCEPTED_AUDIO` — MIME + extension allowlist.
  - `export const MAX_IMPORT_BYTES = 25 * 1024 * 1024` (25 MB per file).
  - `export function validateAudioFile(file: File): void` — throws
    `ValidationError` (reuse the class exported from `src/db/entries.ts`, or
    move it to a shared module and re-export; do not duplicate it) with a clear
    per-file message when the type is not accepted, the size is 0, or the size
    exceeds the cap. Accept by MIME first; when `file.type` is empty (common for
    `.m4a` on some platforms) fall back to the file extension. This is the
    boundary validation required before any decode.

- `src/import/importAudioFiles.ts`
  - `export type FileImportStatus = "queued" | "decoding" | "reading" | "saved" | "skipped" | "failed"`
  - `export interface FileImportItem { name: string; status: FileImportStatus; progress: number; message?: string; entryId?: string }`
  - `export async function importAudioFiles(files: File[], onUpdate: (items: FileImportItem[]) => void): Promise<FileImportItem[]>`
    - Processes files **sequentially** (one basic-pitch inference at a time) so
      progress stays readable and the model is not thrashed. Emits an updated
      item list on every state change (feedback within 100 ms of a drop).
    - Per file: `validateAudioFile` → `decodeToMono22050` → `transcribe(audio, onProgress)`
      (wire the existing `onProgress` fraction into `item.progress`, status
      `"reading"`) → guard against empty transcription and against a decoded
      duration over `MAX_IMPORT_DURATION_SEC = 120` (skip with a clear message)
      → `notesToAbc` → `saveEntry({ ..., title: defaultTitleFromFilename(name), tags: [] })`.
    - Default title: filename without extension, trimmed to the title limit;
      fall back to the existing date-based default if empty.
    - Failure isolation: any thrown error (validation, decode, empty result,
      save) sets that item to `"skipped"` (validation/empty/oversize) or
      `"failed"` (unexpected) with a message and **continues to the next file**.
      Never let one rejection abort the loop.

- `src/export/musicXml.ts`
  - `export function notesToMusicXml(notes: NoteEvent[], meta: { title: string }): string`
  - Pure and deterministic. Emit a minimal valid MusicXML 3.x `score-partwise`
    document for a single-voice melody, quantized on the same 1/16 grid and
    120 BPM / 4-4 assumptions `notesToAbc` uses, with rests for gaps. The same
    `NoteEvent[]` always yields the same XML string.

- `src/export/midi.ts`
  - `export function notesToMidi(notes: NoteEvent[]): Uint8Array`
  - Pure and deterministic. Emit a Standard MIDI File (format 0, single track):
    header chunk + one track with a tempo meta event (120 BPM), note-on/note-off
    pairs derived from `pitchMidi`/`startSec`/`durationSec` at a fixed PPQ
    (e.g. 480), and an end-of-track meta event. The same `NoteEvent[]` always
    yields the same bytes.

- `src/export/exportVault.ts`
  - `export const BACKUP_FORMAT = "hum-vault-backup"` and `export const BACKUP_VERSION = 1`.
  - `export interface BackupManifest { format: string; version: number; exportedAt: number; entryCount: number; entries: BackupEntry[] }` where `BackupEntry` carries
    `{ id, title, tags, createdAt, updatedAt, durationSec, audioMimeType, schemaVersion, notes, contour, notationAbc, files: { audio, musicxml, midi } }`.
  - `export async function buildVaultZip(onProgress?: (done: number, total: number) => void): Promise<Blob>`
    - Reads the **whole** corpus (loop `listEntries` by page via `nextBefore`;
      do not cap at the search backstop). For each entry writes
      `entries/<id>/audio.<ext>` (ext from a mime→extension map, default `.bin`),
      `entries/<id>/notation.musicxml`, `entries/<id>/notation.mid`, and appends
      to the manifest. Writes `manifest.json` at the zip root. Returns a
      `Blob` of type `application/zip`.
    - `export function downloadVaultZip(blob: Blob): void` — object-URL + anchor
      click, filename `hum-vault-backup-<YYYY-MM-DD>.zip`; revoke the URL after.

- `src/import/importVault.ts`
  - `export interface VaultImportResult { imported: number; skipped: number; failed: number; total: number }`
  - `export async function importVaultZip(file: File, onProgress?: (done: number, total: number) => void): Promise<VaultImportResult>`
    - `unzip` the file, read and JSON-parse `manifest.json`. Reject with a clear
      error when the file is not a zip, `manifest.json` is missing/unparseable,
      or `format`/`version` are unrecognized (accept `version === 1`).
    - For each manifest entry: read the referenced audio bytes, build a `Blob`
      with `audioMimeType`; validate `title`/`tags`/`notationAbc`/`notes` at the
      boundary; recompute `contour` via `computeContour(notes)`; call
      `putImportedEntry` (below). A missing audio file or a validation failure
      for one entry increments `failed` and **continues**; an entry whose `id`
      already exists increments `skipped`.

- `src/db/storage.ts`
  - `export async function getStorageEstimate(): Promise<{ usageBytes: number | null; quotaBytes: number | null; entryCount: number }>`
    — `navigator.storage.estimate()` when available (else nulls), plus
    `countEntries()`. Never throws; degrade to `entryCount` only.

- `src/components/SettingsScreen.tsx` — the Settings route (below).

- `src/components/ImportPanel.tsx` — the drop zone + file picker + per-file
  progress list, used on the capture screen. (May be inlined into
  `CaptureScreen` if that reads cleaner; a component keeps `CaptureScreen`
  focused.)

**Modified modules**

- `src/db/entries.ts`
  - `export function putImportedEntry(entry: Entry): Promise<"imported" | "skipped">`
    — validates `title`/`notationAbc`/`tags` and the presence of `audio`/`notes`,
    then, in one `readwrite` transaction, checks whether `entry.id` already
    exists: if so resolves `"skipped"` without writing; otherwise `put`s the
    entry **preserving** `id`, `createdAt`, `updatedAt`, and `schemaVersion`, and
    resolves `"imported"`. This is what makes repeated import idempotent.
  - If `ValidationError` is moved to a shared module, keep a re-export here so
    existing imports do not break.

- `src/router/useHashRoute.ts` — add a `{ name: "settings" }` route and parse
  `"/settings"`.

- `src/App.tsx` — render `SettingsScreen` for the `settings` route.

- `src/components/SongbookScreen.tsx` — add a subordinate **Settings** control
  in the topbar (tap 1) so Export (tap 2, on the Settings screen) is reachable
  in two taps. Keep "Hum to search" the single primary action; Settings is a
  quiet link/icon, visibly subordinate.

- `src/components/CaptureScreen.tsx` — surface the import affordance on the idle
  capture screen (render `ImportPanel`), so a new user with a pile of memos can
  fill the vault. Recording stays the primary action; import is subordinate.

- `src/copy/strings.ts` — add all new strings (see Copy section).

- `README.md` — document bulk import and backup/restore.

- `package.json` — add `fflate`.

### Zip layout (contract)

```
manifest.json
entries/<id>/audio.<ext>
entries/<id>/notation.musicxml
entries/<id>/notation.mid
```

`manifest.json`:

```json
{
  "format": "hum-vault-backup",
  "version": 1,
  "exportedAt": 1757900000000,
  "entryCount": 2,
  "entries": [
    {
      "id": "…", "title": "…", "tags": ["…"],
      "createdAt": 0, "updatedAt": 0, "durationSec": 0,
      "audioMimeType": "audio/webm", "schemaVersion": 1,
      "notes": [ { "pitchMidi": 60, "startSec": 0, "durationSec": 0.5 } ],
      "contour": { "version": 1, "noteCount": 0, "intervals": [], "ioiRatios": [] },
      "notationAbc": "…",
      "files": { "audio": "entries/…/audio.webm", "musicxml": "entries/…/notation.musicxml", "midi": "entries/…/notation.mid" }
    }
  ]
}
```

### Privacy / security (QUALITY BAR §5, adapted to a client-only app)

- No network I/O anywhere in this EPIC. Zip is built and downloaded locally;
  import reads the chosen file locally. Audio never leaves the device.
- Input validated at every boundary: dropped files (type + size before decode),
  imported manifest and per-entry fields (types, sizes, array shapes) before any
  DB write. Reuse the existing title/tag/notation limits.
- No PII in logs. Follow the existing `listContours` precedent: log counts only,
  never titles, notes, contours, or filenames.
- No authenticated routes exist (client-only), so there is nothing to authorize
  server-side; state this in the README privacy note, consistent with the
  current one.

---

## Ordered task list (with acceptance criteria)

Each task's criteria are provable by the tests named in the Test plan.

### T1. Boundary validation for imported audio
Build `validateAudioFile` with the MIME/extension allowlist, size cap, and
zero-byte guard.
- **AC1.1** A file whose type is not in the allowlist (and whose extension is not
  either) throws `ValidationError` with a clear, human message.
- **AC1.2** A file over `MAX_IMPORT_BYTES` throws with a clear size message.
- **AC1.3** A `.m4a` file reported with an empty `type` is accepted via its
  extension.
- **AC1.4** Validation runs and can reject **before** any decode call.

### T2. Deterministic MusicXML and MIDI exporters
Build `notesToMusicXml` and `notesToMidi`.
- **AC2.1** `notesToMusicXml` returns a well-formed `score-partwise` document
  containing a `<note>` for each transcribed note; identical input yields an
  identical string.
- **AC2.2** `notesToMidi` returns bytes beginning with the `MThd` header and one
  `MTrk` track, with a note-on/note-off pair per note; identical input yields
  identical bytes.
- **AC2.3** Both handle an empty `notes` array without throwing (valid empty
  score / empty track).

### T3. Bulk import pipeline with per-file progress and failure isolation
Build `importAudioFiles` and wire the existing `transcribe` `onProgress`.
- **AC3.1** Importing N valid files saves N entries; each item reaches `"saved"`
  and carries its `entryId`.
- **AC3.2** Each item passes through visible states with a progress fraction
  during `"reading"`; `onUpdate` fires on every transition.
- **AC3.3** A batch containing one invalid file (bad type / oversize / empty
  transcription) marks exactly that item `"skipped"` or `"failed"` with a message
  and still saves every valid file. The batch never aborts on one failure.
- **AC3.4** An imported entry's `contour` is computed by the same `saveEntry`
  path as a live hum, so search treats it identically.

### T4. Full vault export
Build `buildVaultZip` / `downloadVaultZip` and the mime→extension map.
- **AC4.1** The zip contains `manifest.json` plus, per entry, an audio file, a
  `notation.musicxml`, and a `notation.mid` under `entries/<id>/`.
- **AC4.2** The manifest lists every entry with title, tags, and timestamps
  (and the fields import needs).
- **AC4.3** Export reads the entire corpus by paging, not just the search
  backstop; a corpus larger than one page still exports fully.

### T5. Vault re-import with dedup
Build `importVaultZip` and `putImportedEntry`.
- **AC5.1** Importing a zip produced by T4 restores each entry with matching
  `notes`, recomputed-and-equal `contour`, `tags`, `notationAbc`, `title`,
  `createdAt`, and audio bytes/mime.
- **AC5.2** Importing the same zip a second time adds nothing new: every entry
  is reported `skipped`, and the total entry count is unchanged.
- **AC5.3** A zip missing `manifest.json`, or with an unknown `format`/`version`,
  or that is not a zip, fails with a clear message and writes nothing.
- **AC5.4** One entry with a missing audio file or invalid fields is counted
  `failed` while the other entries still import.

### T6. Settings screen: storage usage + export + import (two-tap export)
Build `SettingsScreen`, the `/settings` route, and the songbook link.
- **AC6.1** From the songbook, Settings opens in one tap and Export runs in the
  next (two taps total).
- **AC6.2** Settings shows storage usage (used space when
  `navigator.storage.estimate` is available) and the entry count; it degrades to
  the entry count alone when the API is missing, without error.
- **AC6.3** Settings hosts Export (downloads the zip) and Import (accepts a zip
  and shows the imported/skipped/failed summary).
- **AC6.4** Export, import, and storage read each have designed idle, working,
  done, and error states. No white screen, no raw error text.

### T7. Capture-screen import affordance
Render `ImportPanel` on the idle capture screen.
- **AC7.1** The idle capture screen shows a discoverable way to add existing
  audio files, with a **file input** (mobile baseline) and a **drop target**
  (desktop enhancement). Recording remains the primary action.
- **AC7.2** Dropping or choosing files shows the per-file progress list from T3.

### T8. Copy, README, and quality-bar pass
- **AC8.1** Every new user-visible string is in `src/copy/strings.ts` and the
  copy sweep (`tests/copy.test.ts`) passes: no em/en dashes, no banned
  vocabulary, no negative empty-state phrasing.
- **AC8.2** The README documents bulk import and backup/restore with accurate
  steps, and the README copy sweep still passes.
- **AC8.3** All new surfaces are usable at 390px with no horizontal scroll,
  ~44px touch targets, labeled inputs, and visible focus states.

---

## Quality bar mapping (BINDING)

- **Perceived speed (§1):** per-file rows appear within 100 ms of a drop/choose;
  progress updates continuously during transcription; export and import show
  in-place progress; the Settings storage read shows a placeholder then a value.
  Export pages the corpus (no unbounded synchronous scan on the hot path).
- **Mobile-first (§2):** file input is the baseline path (mobile browsers have no
  drag-and-drop); drag-drop is the desktop enhancement. Everything works and
  fits at 390px.
- **Designed states (§3):** import panel has an idle prompt, per-file progress,
  and per-file error rows plus a batch summary; export/import each have
  idle/working/done/error; Settings has a loading placeholder for storage.
- **First-run (§4):** unchanged core onboarding (owned elsewhere). The import
  affordance on the idle capture screen makes the cold-start path discoverable
  in one short line. No new walkthrough here.
- **Security hygiene (§5):** as in the Privacy/security section. Client-only,
  boundary validation everywhere, counts-only logging.
- **Accessibility (§6):** every new input labeled; drop zone reachable and
  operable by keyboard via its file input; visible focus; sufficient contrast.
- **Radically simple (§7):** one primary action per screen (capture: Record;
  songbook: Hum to search; settings: Export). Import, drop zone, and Settings
  link are visibly subordinate. Short labels, a real filename as the default
  title, no instruction paragraphs.
- **Copy (§8):** all strings centralized and swept (T8).
- **README (§9):** import/backup documented for strangers.

---

## Copy (draft strings, pre-swept — add to `src/copy/strings.ts`)

Sweep every one of these before shipping (no `—`/`–`, no banned words, positive
phrasing). Suggested `strings` additions:

```
import: {
  heading: "Add from files",
  hint: "Drop voice memos here, or choose files.",
  choose: "Choose files",
  reading: "Reading",        // shown with the per-file progress
  decoding: "Opening",
  saved: "Saved",
  batchDone: "Added {n} of {total}.",   // fill n/total at render
  skippedType: "Hum Vault reads audio recordings. Choose an mp3, m4a, wav, or webm file.",
  skippedSize: "This file is over 25 MB. Choose a shorter recording.",
  skippedEmpty: "Try a file with one steady hum, then add it again.",
  failed: "This file did not open. Try another one.",
},
settings: {
  heading: "Settings",
  storageHeading: "Storage",
  storageUsed: "{used} used",           // e.g. "12 MB used"
  entryCount: "{n} ideas saved",
  export: "Export backup",
  exporting: "Preparing your backup",
  exportDone: "Backup downloaded.",
  exportError: { title: "Try the export again", body: "The backup did not finish. Try once more.", action: "Try again" },
  import: "Import backup",
  importing: "Restoring your ideas",
  importDone: "Restored {imported}. Skipped {skipped}.",  // fill counts
  importError: { title: "Choose a Hum Vault backup", body: "This is not a backup file. Choose a backup zip you exported here.", action: "Try again" },
},
nav: { settings: "Settings" }  // add alongside existing nav strings
```

These are drafts. The implementer may reword for their exact UI as long as the
sweep still passes and phrasing stays positive and short. Numbers/counts are
interpolated at render, not baked into the constant.

---

## Test plan

Tests use the existing infra: Vitest + jsdom + `fake-indexeddb` (each test file
resets the DB per the current `tests/setup.ts`), Testing Library for components,
and the pinned Playwright container (`scripts/e2e.sh`) for end-to-end. `fflate`
runs under jsdom, so zip round-trips are unit-testable without a browser.

### Unit

- `tests/validateAudioFile.test.ts` (T1): a table of accepted MIME types,
  accepted-by-extension `.m4a` with empty type, rejected type, oversize, and
  zero-byte. Proves AC1.1–AC1.4.
- `tests/musicXml.test.ts` (T2): a fixed `NoteEvent[]` yields a stable string
  containing one `<note>` per note and parses as XML; empty input yields a valid
  empty score. Proves AC2.1, AC2.3.
- `tests/midi.test.ts` (T2): output starts with `MThd`, contains one `MTrk`, has
  the expected note-on/note-off count, and is byte-stable across runs; empty
  input is handled. Proves AC2.2, AC2.3.
- `tests/exportVault.test.ts` (T4): save several entries, `buildVaultZip`,
  `unzip`, and assert `manifest.json` plus per-entry audio/musicxml/midi paths;
  seed more than one page and assert every entry is present. Proves AC4.1–AC4.3.
- `tests/importVault.test.ts` (T5): round-trip (export → clear DB → import) and
  assert restored `notes`, `contour` (equal to a fresh `computeContour(notes)`),
  `tags`, `notationAbc`, `title`, `createdAt`, and audio byte length/mime;
  import the same zip twice and assert the count is unchanged and all `skipped`;
  feed a non-zip / a zip without a manifest / an unknown version and assert a
  thrown clear error with no writes; corrupt one entry's audio path and assert it
  is `failed` while others import. Proves AC5.1–AC5.4.
- `tests/entries.test.ts` (extend, T5): `putImportedEntry` preserves `id`,
  `createdAt`, `updatedAt`, and returns `"skipped"` for an existing `id`.
- `tests/importAudioFiles.test.ts` (T3): with `decodeToMono22050` and
  `transcribe` mocked, importing three files where one throws yields two `saved`
  and one `skipped`/`failed`, `onUpdate` fires per transition, and progress
  reaches 1 for saved files. Proves AC3.1–AC3.3. AC3.4 is covered by asserting a
  saved import produces the same contour as the direct `saveEntry` path for the
  same notes.

### Component

- `tests/settingsScreen.test.tsx` (T6): renders storage usage from a mocked
  `getStorageEstimate`, falls back to entry count when estimate returns nulls,
  triggers `buildVaultZip` on Export (mock the download), and shows the
  imported/skipped summary on Import. Proves AC6.2–AC6.4.
- `tests/importPanel.test.tsx` (T7): choosing files renders per-file rows and
  reflects saved/failed states (pipeline mocked). Proves AC7.1–AC7.2.
- `tests/copy.test.ts` (existing, T8): automatically scans the new `strings`
  entries; add nothing but the strings themselves. Proves AC8.1.

### End-to-end (`tests/e2e/backup.spec.ts`, at 390px)

- Import: from the capture screen, use the file input to add the bundled sample
  (`tests/fixtures/simple-hum.wav`) and confirm a new songbook entry appears; no
  horizontal scroll. (Proves AC3.1/AC7 in a real browser.)
- Two-tap export: from the songbook, open Settings (tap 1), Export (tap 2), and
  assert a `.zip` download event fires. (Proves AC6.1, AC4.)
- Round-trip: import that downloaded zip back in a fresh context and assert the
  entry is restored; import it again and assert no duplicate row appears.
  (Proves AC5.1–AC5.2.) If driving a downloaded file back through the file
  chooser is impractical in the container, cover the round-trip in
  `importVault.test.ts` (unit) and keep the e2e to import-file + export-download.

A criterion is met only when its test passes **and** the surface clears the
quality bar above (mobile layout, designed states, swept copy).

---

## Open decisions resolved (so the implementer does not have to ask)

- **Derived-file source:** `notes`, not `notationAbc` (see Data model).
- **Contour on import:** recomputed from `notes`, manifest copy is informational.
- **Dedup key:** entry `id`; repeated import is idempotent via `putImportedEntry`.
- **Concurrency:** import files sequentially.
- **Caps:** 25 MB/file; 120 s decoded duration/file; export pages the full
  corpus (no cap).
- **Two taps:** Songbook → Settings → Export.
- **No DB migration:** existing v1 schema suffices.
- **`persist()` and eviction UX:** out of scope (deferred).
