# EPIC SPEC — The songbook (persistence)

> This is EPIC 2 of Hum Vault. EPIC 1 shipped the capture screen: hum,
> get playable draft notation, hear it back, all on-device and in memory
> only. This EPIC gives those ideas somewhere to live. A captured hum
> becomes a durable **Entry** in IndexedDB (audio, transcribed notes,
> melody contour, draft notation, tags). The user browses a **songbook**,
> opens an entry, plays it, renames it, tags it, edits the draft notation,
> and deletes it. The contour index is computed and stored at save time so
> the EPIC 3 search is instant. No search UI, no import, no export, no
> walkthrough here.

---

## Quality differentiator (restate at the top of every spec)

**Recall of your own past ideas by ear.** Hum Vault wins on retrieval by
melody: a half-remembered fragment, hummed, returns the exact past idea.
Everything else stays deliberately simple to protect that one capability.

**What this EPIC owes the differentiator:** the differentiator is only as
good as the corpus and the index it searches. This EPIC builds both. Two
things must be right or every later search inherits the error:

1. **The corpus must be durable.** An idea the user saved must still be
   there after a reload and after the browser restarts. If entries silently
   vanish, the promise ("no melodic idea you ever had is lost") is broken at
   the foundation. Persist the original audio blob and the transcribed notes
   faithfully.
2. **The stored contour must be a faithful, key-independent index of the
   melody.** EPIC 3 matches a hummed fragment against `Entry.contour`. This
   EPIC computes that contour from the transcribed `notes` at save time and
   stores it. Get the contour honest: consecutive pitch intervals (so the
   same shape matches in any key or octave) and tempo-independent rhythm
   ratios. Depth in this EPIC goes into a correct, deterministic contour and
   durable storage, not into songbook chrome.

This EPIC does **not** implement matching (that is EPIC 3, a binding
non-goal here). It produces the raw material matching depends on.

---

## Scope

### In scope
- A **persistence layer** over IndexedDB: an `Entry` object store, a
  `createdAt` index for newest-first listing, and typed CRUD plus bounded,
  newest-first pagination.
- A pure **contour** function that derives the melody index from an
  `Entry`'s notes, stored on the entry at save time.
- A **Save to songbook** action on the capture screen's `ready` result,
  which persists the current hum (audio blob, notes, contour, draft ABC,
  auto title, empty tags) as an Entry.
- A minimal, dependency-free **hash router** and app shell so the app has
  three client views: capture (`#/`), songbook (`#/songbook`), and entry
  detail (`#/entry/:id`), with working browser back and deep links.
- The **Songbook screen**: entries newest first, each row showing enough to
  recognize the idea (title, date, tags) with a Play control and a way to
  open the entry. Bounded query and bounded initial render (pagination), so
  it stays smooth with hundreds of entries. Designed empty, loading, and
  error states.
- The **Entry detail screen**: play the entry, rename it, add and remove
  tags, edit the draft notation, and delete it behind a confirm step.
  Designed loading, error, and not-found states.
- All new user-visible strings centralized in `src/copy/strings.ts` and
  swept.
- Automated tests proving every acceptance criterion, including an
  end-to-end proof that a saved entry survives a page reload.

### Out of scope (binding non-goals — do NOT build)
- **The search algorithm and results UI.** No contour matching, no ranking,
  no "hum to search" control, no `/search` view. This EPIC only *stores* the
  contour; EPIC 3 matches against it.
- **Bulk import** (drag-and-drop of files). EPIC 4.
- **Export / backup** (zip, MusicXML, MIDI download, re-import, storage-usage
  UI, "clear vault"). EPIC 4. Do not add a `/settings` view.
- **First-run walkthrough** and **demo seed** (`SEED_DEMO`). EPIC 5. See the
  note below on why the empty songbook state alone satisfies the bar here.
- **Playing the raw audio blob.** See "Playback" below: entry playback is the
  synthesized notation, consistent with capture. The original audio is stored
  for durability and future export, not surfaced as an `<audio>` player in
  this EPIC.
- **Re-transcription or notes editing.** The user edits the *draft notation*
  (`notationAbc`), a separate editable field. The transcribed `notes` and the
  `contour` derived from them do not change when notation is hand-edited (see
  "The notation/notes boundary").
- Engraving-grade notation, tempo/key detection, polyphony (unchanged plan
  non-goals).
- Any runtime LLM, BYOK surface, or gateway call (hard plan non-goal).

### The walkthrough non-goal vs. the quality bar (read before building)
QUALITY BAR §4 asks for a guided first-run path. The product plan sequences
that guided path and the demo seed into EPIC 5 and lists "walkthrough" as a
non-goal here. This is not a bar-vs-scope conflict: the app is not yet
"shipped", and the surfaces this EPIC adds are self-explanatory under §7. Meet
§4's intent the honest way for this EPIC: the empty songbook state names what
the screen is for and points at the one action that fills it (record), and the
Save action on capture is unmistakable. **Do not build a walkthrough, coach
marks, a tour library, or an onboarding checklist here.** If during build you
believe a true conflict exists, stop and set the run `blocked` with the precise
question rather than building a non-goal.

---

## Technical design

### Stack (unchanged, plus one dev-only test polyfill)
- Same as EPIC 1: TypeScript + React 18 + Vite, `abcjs` for render/playback,
  `vitest` + `@testing-library/react` + `jsdom` for unit/component tests,
  Playwright (Chromium) for the one end-to-end proof.
- **Do not add a runtime dependency.** In particular: no router library
  (a ~40-line hash router is the right size for three views), no IndexedDB
  wrapper library (a small internal promise wrapper over the native API is
  enough), no state-management library, no virtualization library
  (pagination covers the bounded-list requirement).
- **Add exactly one dev dependency:** `fake-indexeddb` (for unit-testing the
  persistence layer under jsdom, which has no IndexedDB). Wire it in
  `tests/setup.ts` with `import "fake-indexeddb/auto";`.

### Data model (forward-only; IndexedDB version 1)
Nothing was persisted before this EPIC, so this is the first schema. Create
it in the database's `onupgradeneeded` handler at DB version **1**.

```ts
// src/db/schema.ts
import type { NoteEvent } from "../transcribe/types";

export const DB_NAME = "humvault";
export const DB_VERSION = 1;
export const ENTRY_STORE = "entries";
export const CREATED_AT_INDEX = "byCreatedAt";
export const ENTRY_SCHEMA_VERSION = 1;   // per-record schema version
export const CONTOUR_VERSION = 1;        // contour algorithm version

// The melody search index, derived from an entry's notes at save time.
// EPIC 3 matches a hummed fragment against this. Intervals make the match
// key- and octave-independent; ioiRatios make rhythm tempo-independent.
export interface MelodyContour {
  version: number;      // CONTOUR_VERSION at compute time
  noteCount: number;    // notes.length (cheap length prefilter for search)
  intervals: number[];  // consecutive semitone deltas; length = max(0, n-1)
  ioiRatios: number[];  // consecutive inter-onset-interval ratios; length = max(0, n-2)
}

export interface Entry {
  id: string;            // crypto.randomUUID()
  title: string;
  createdAt: number;     // epoch ms; the newest-first sort key
  updatedAt: number;     // epoch ms
  audio: Blob;           // the original recording, stored as a Blob
  audioMimeType: string; // blob.type at capture, e.g. "audio/webm"
  durationSec: number;   // decoded audio length in seconds
  notes: NoteEvent[];    // the transcription (unchanged shape from EPIC 1)
  contour: MelodyContour;// derived from notes; the search index
  notationAbc: string;   // editable draft ABC (from notesToAbc, then user edits)
  tags: string[];
  schemaVersion: number; // ENTRY_SCHEMA_VERSION at save time
}
```

**Object store:** `keyPath: "id"`. One index: `CREATED_AT_INDEX` on
`createdAt` (not unique). All listing goes through this index so no query
scans the whole store unsorted.

**Forward-only migration policy (state this in a comment in `schema.ts`):**
future EPICs bump `DB_VERSION` and add steps to `onupgradeneeded`; they never
delete or destructively rewrite existing records. `schemaVersion` and
`contour.version` on each record let later code detect and upgrade old records
in place.

Blobs are stored directly; IndexedDB persists `Blob` values natively, so the
original audio round-trips without base64 encoding.

### Persistence layer API (`src/db/entries.ts`)
A thin, typed, promise-based wrapper. Open the DB once (module-level cached
promise) and reuse the connection.

```ts
export function saveEntry(input: {
  audio: Blob;
  audioMimeType: string;
  durationSec: number;
  notes: NoteEvent[];
  notationAbc: string;
  title: string;
  tags: string[];
}): Promise<Entry>;
// Assigns id (crypto.randomUUID), createdAt=updatedAt=Date.now(),
// schemaVersion, and computes contour = computeContour(notes) INTERNALLY so
// "contour is derived from notes" is enforced in one place. Puts and returns
// the full Entry.

export function getEntry(id: string): Promise<Entry | undefined>;

export function listEntries(opts?: {
  limit?: number;    // default 30
  before?: number;   // createdAt of the last row of the previous page
}): Promise<{ entries: Entry[]; nextBefore: number | null }>;
// Newest first. Opens a "prev" (descending) cursor on CREATED_AT_INDEX.
// When `before` is set, bounds the range with upperBound(before, true) so
// paging continues after the previous page. Collects up to `limit`.
// nextBefore = last returned entry's createdAt when a full page came back
// (more may exist), otherwise null.

export function updateEntry(
  id: string,
  patch: Partial<Pick<Entry, "title" | "tags" | "notationAbc">>,
): Promise<Entry>;
// Reads, applies patch, sets updatedAt = Date.now(), puts, returns the
// updated Entry. Only title, tags, and notationAbc are patchable here.
// notes and contour are immutable in this EPIC.

export function deleteEntry(id: string): Promise<void>;

export function countEntries(): Promise<number>;
// store.count() — O(1)-ish in IndexedDB; used for the songbook count badge.
```

Validate inputs at this boundary (QUALITY BAR §5), even though everything is
local: reject a `saveEntry`/`updateEntry` with a `title` longer than 120
chars, a `notationAbc` longer than 20000 chars, more than 20 tags, any tag
longer than 30 chars after trim, or an empty/whitespace tag. Trim tags and
drop duplicates before storing.

Wrap IndexedDB errors so callers get a rejected promise they can turn into a
designed state. A `QuotaExceededError` on save must surface the save-error
state, never crash.

### Contour computation (`src/melody/contour.ts`) — pure and deterministic
```ts
export function computeContour(notes: NoteEvent[]): MelodyContour;
```
- Sort a copy of `notes` by `startSec` (defensive; the transcription already
  orders them).
- `intervals[i] = round(notes[i+1].pitchMidi) - round(notes[i].pitchMidi)`
  for each adjacent pair. Integer semitones. This is what makes matching
  key- and octave-independent: the same melodic shape hummed higher or lower
  yields identical intervals.
- Inter-onset interval `ioi[i] = notes[i+1].startSec - notes[i].startSec`.
  `ioiRatios[i] = ioi[i+1] / max(ioi[i], EPSILON)` with a small epsilon
  (e.g. `1e-4`) to avoid divide-by-zero. Ratios are tempo-independent: humming
  the same rhythm faster or slower yields the same ratios.
- `noteCount = notes.length`. `version = CONTOUR_VERSION`.
- Edge cases: 0 or 1 note produces empty `intervals` and `ioiRatios`;
  2 notes produce one interval and no ratio. Never throw.

This function is **pure**: the same `notes` always yields the same contour.
That determinism is what the unit test pins, and it is the property EPIC 3
relies on. Keep the raw arrays here (no bucketing or quantization); EPIC 3
owns any coarsening it needs at match time and may raise `CONTOUR_VERSION`
if it changes the representation.

### The notation/notes boundary (a deliberate design decision)
The plan's data model says `notationAbc` is "regenerated from notes and user
edits" while `contour` is "derived from notes". So in this EPIC:
- At save, `notationAbc = notesToAbc(notes)` (the EPIC 1 draft) and
  `contour = computeContour(notes)`.
- Editing the draft notation on the detail screen changes only
  `notationAbc` (and `updatedAt`). It does **not** change `notes` or
  `contour`. Search therefore matches the transcription, not hand edits.
State this in a code comment and in the README's "how it works" note.
Reconciling hand edits back into the search index is a later concern; do not
build it here.

### Routing and app shell (`src/router/useHashRoute.ts`, `src/App.tsx`)
Add a tiny hash router. Hash routing needs no nginx change (the existing
`try_files ... /index.html` already serves the SPA, and the hash never
reaches the server).

- `useHashRoute()` reads `window.location.hash`, subscribes to
  `hashchange`, and returns the current route. Provide a `navigate(path)`
  helper that sets `location.hash`.
- Routes:
  - `#/` or empty → **CaptureScreen**
  - `#/songbook` → **SongbookScreen**
  - `#/entry/:id` → **EntryDetailScreen** with the parsed `id`
  - anything else → navigate to `#/`
- `App.tsx` switches on the route. Keep it a plain switch; no nested router
  abstraction.
- Navigation affordances (kept subordinate to each screen's one primary
  action, per §7):
  - **Capture** shows a subtle "Songbook" link (with the entry count when
    > 0) that navigates to `#/songbook`. The primary action stays Record.
  - **Songbook** shows a primary "Record a hum" action that navigates to
    `#/`, and each row opens `#/entry/:id`.
  - **Entry detail** shows a back affordance to `#/songbook`.

### Shared playback (`src/playback/player.ts`)
Three surfaces can now play audio (capture, songbook row, entry detail). Add
a module-level singleton so only one melody plays at a time:
```ts
export function getSharedPlayer(): MelodyPlayer; // lazily creates one instance
export function disposeSharedPlayer(): void;
```
- Refactor `CaptureScreen` to use `getSharedPlayer()` instead of its own
  `createPlayer()` ref, and to `stop()` (not `dispose()`) the shared player
  on unmount. Keep `createPlayer` exported for tests.
- Songbook and detail call `getSharedPlayer().play(visualObj)`; because it is
  the same instance, starting one entry stops the previous one.

### Rendering ABC to a playable object off the detail view (`src/notation/renderAbc.ts`)
The songbook list must be able to play a row without mounting a full
`NotationView` per row. Add:
```ts
export function abcToVisualObj(abc: string): VisualObj | null;
```
It renders `abc` with `abcjs.renderAbc` into a transient, visually-hidden,
in-DOM container (create it, render, read `rendered[0]`, remove the
container) and returns the tune object the synth needs. Return `null` on
failure so callers can show the playback-error state. The `EntryDetailScreen`
may instead reuse the existing `NotationView` (which already lifts the visual
object via `onRendered`) since it shows the notation anyway.

### Save flow on the capture screen (`src/components/CaptureScreen.tsx`)
The `ready` phase currently keeps only `abc`. To save, it must also retain the
source blob, the transcribed `notes`, the `audioMimeType`, and `durationSec`.
- In `runPipeline`, capture the decoded audio length: `durationSec =
  decodedFloat32.length / 22050`. Retain the source `Blob` and its `.type`,
  and the `notes` array, in refs/state alongside `abc`.
- In the `ready` phase, add a **primary** "Save to songbook" button (the
  existing Play/Record-another become clearly secondary while a save is
  offered, or Save sits as the primary above them). On tap:
  - Give feedback within 100ms (pressed/disabled state, label → "Saving").
  - Call `saveEntry({ audio, audioMimeType, durationSec, notes,
    notationAbc: abc, title: defaultTitle(), tags: [] })`.
  - On success, show "Saved" and reveal a way to the songbook (navigate to
    `#/songbook`, or an inline "View in songbook" link). Do not silently
    stay on a stale screen.
  - On failure (including quota), show the designed save-error state with a
    retry; never a raw error.
- `defaultTitle()` returns a friendly, editable default such as
  `"Hum, Sep 11"` using the entry's date via `toLocaleDateString` with
  `{ month: "short", day: "numeric" }`. Titles need not be unique.
- Saving is offered for any `ready` result, including the "Try an example"
  path (it produces a legitimate melody). Do not special-case it.

### Songbook screen (`src/components/SongbookScreen.tsx` + a row component)
- On mount, `listEntries({ limit: 30 })`. Show a **loading** state
  (skeleton rows or an in-place spinner that holds layout) while the first
  page loads. Never a white screen.
- **Empty state** (zero entries): a designed surface (see copy) with the
  screen's purpose and a primary "Record a hum" action to `#/`.
- **Populated:** render rows newest first. Each row shows the title, a
  relative or short date, its tags, and a **Play** control, and the whole
  row (or a clear affordance) opens `#/entry/:id`. Row Play lazily builds a
  visual object via `abcToVisualObj(entry.notationAbc)` and plays it through
  the shared player; tapping another row's Play stops the first. Give the
  pressed/active state within 100ms.
- **Pagination (bounded list):** initial page of 30. When `nextBefore` is
  not null, show a "Show more" control that appends the next page via
  `listEntries({ limit: 30, before: nextBefore })`. The query is always
  bounded by the cursor + limit (satisfies "no unindexed query on a hot
  path; no endpoint that gets slower with every row"). Note the tie caveat:
  `createdAt` from `Date.now()` is effectively unique at human save rates; do
  not worry about sub-millisecond ties.
- **Error state:** if `listEntries` rejects, show the designed songbook load
  error with a Reload action.
- Mobile-first at 390px: single-column rows, 44px touch targets, no
  horizontal scroll.

### Entry detail screen (`src/components/EntryDetailScreen.tsx`)
- On mount, `getEntry(id)`. Loading state holds layout. If the entry is
  missing (bad id or already deleted), show the designed **not-found** state
  with a link back to the songbook.
- Show the entry title (as an editable field), the rendered draft notation
  (reuse `NotationView` for render + Play), the tags, and the actions below.
- **Rename:** an editable title input, saved on blur or an explicit save,
  persisted via `updateEntry(id, { title })`. Optimistic: reflect the new
  title immediately; on failure show the save-error state and revert.
- **Tags:** a tag editor. Chips with an accessible remove control
  (`aria-label` "Remove tag {tag}"), plus an input and an Add action.
  Adding/removing persists via `updateEntry(id, { tags })`, applying the
  boundary validation above. Optimistic update with feedback within 100ms.
- **Edit draft notation:** an "Edit notation" toggle reveals a labeled
  `<textarea>` seeded with `notationAbc`. Editing re-renders a live preview
  via `NotationView`/`renderAbc`. Save persists via
  `updateEntry(id, { notationAbc })`; the change is reflected in playback
  (the synth sounds the edited ABC). Guard empty/oversize input.
- **Delete:** a Delete action opens an accessible **confirm dialog**
  (`role="dialog"`, `aria-modal="true"`, labelled by its title, focus moved
  into the dialog, Escape and a Cancel/"Keep" button dismiss it, focus
  returns to the trigger). Confirm calls `deleteEntry(id)`, then navigates to
  `#/songbook`. On failure, show the save-error state.
- Mobile-first at 390px, semantic headings, labeled inputs, visible focus.

### Security / quality-bar notes specific to this EPIC
- Client-only, no server, no data leaves the device: QUALITY BAR §5's
  server-side authorization and rate-limiting clauses are satisfied
  vacuously (there is nothing to authorize and no endpoint to throttle).
  State this in the README, as EPIC 1 did. The relevant hygiene here is
  **input validation at the boundary** (the `saveEntry`/`updateEntry`
  limits above), graceful handling of storage quota, and **no PII in logs**
  (never log audio, notes, contour, tags, or titles).
- No secrets are added; the env/telemetry wiring from EPIC 1 is unchanged.

---

## User-visible copy (write these verbatim into `src/copy/strings.ts`; pre-swept)

Add these under the existing `strings` object so `tests/copy.test.ts` scans
them automatically. They are pre-swept for em-dashes, banned LLM vocabulary,
and negative empty-state phrasing. If you change a string, re-sweep it.

- Nav / actions:
  - Songbook link and heading: `Songbook`
  - Save action on capture: `Save to songbook`
  - Saving in progress: `Saving`
  - Saved confirmation: `Saved`
  - View saved entry link: `View in songbook`
  - Back to songbook: `Songbook`
  - Record from songbook: `Record a hum`
  - Show more entries: `Show more`
  - Play (list and detail): `Play`
- Songbook empty state:
  - title: `Start your songbook`
  - body: `Every hum you save lands here, ready to play back. Record your first idea to begin.`
  - action: `Record a hum`
- Songbook load error:
  - title: `Reload to open your songbook`
  - body: `The songbook could not open just now. Reload the page to try again.`
  - action: `Reload`
- Save error (capture and detail):
  - title: `Try saving again`
  - body: `The save could not finish. Try once more.`
  - action: `Try again`
- Entry detail labels:
  - title field label: `Title`
  - tags label: `Tags`
  - add-tag placeholder: `Add a tag`
  - add-tag action: `Add`
  - remove-tag label prefix: `Remove tag` (compose `Remove tag {tag}` for aria)
  - notation section heading: `Draft notation`
  - edit-notation action: `Edit notation`
  - save-notation action: `Save`
  - notation textarea label: `Notation`
  - delete action: `Delete`
- Entry not found:
  - title: `Back to the songbook`
  - body: `This idea is not in your songbook. It may have been removed.`
  - action: `Songbook`
- Delete confirm dialog:
  - title: `Delete this idea?`
  - body: `This removes the recording and its notation from this device. This cannot be undone.`
  - confirm: `Delete`
  - cancel: `Keep`

(The EPIC 1 strings, including `record.tryExample`, `ready.play`,
`ready.startOver`, and the error states, stay as they are.)

---

## Files / modules

### New
```
src/
  db/
    schema.ts                 Entry, MelodyContour, DB constants, migration comment
    entries.ts                openDb + saveEntry/getEntry/listEntries/updateEntry/deleteEntry/countEntries
  melody/
    contour.ts                computeContour(notes) -> MelodyContour (pure)
  router/
    useHashRoute.ts           hash route hook + navigate()
  notation/
    renderAbc.ts              abcToVisualObj(abc) for list playback
  components/
    SongbookScreen.tsx        list, pagination, empty/loading/error states
    EntryRow.tsx              one list row: title, date, tags, Play, open
    EntryDetailScreen.tsx     play, rename, tags, edit notation, delete
    TagEditor.tsx             chips + add/remove (used by detail)
    ConfirmDialog.tsx         accessible modal confirm (used for delete)
  styles/
    songbook.css              (or extend existing app.css)
tests/
  contour.test.ts
  entries.test.ts             uses fake-indexeddb
  songbookScreen.test.tsx
  entryDetail.test.tsx
  captureSave.test.tsx        Save action persists an Entry
  e2e/
    songbook.spec.ts          save -> reload -> persists -> open -> play at 390px
```

### Changed
```
src/App.tsx                   switch on useHashRoute()
src/components/CaptureScreen.tsx  retain notes/blob/duration; Save action + states; use shared player
src/playback/player.ts        add getSharedPlayer()/disposeSharedPlayer()
src/copy/strings.ts           add the strings above
tests/setup.ts                import "fake-indexeddb/auto";
package.json                  add devDependency: fake-indexeddb
```

---

## Ordered task list (with acceptance criteria)

### Task 1 — Contour index (pure)
Implement `src/melody/contour.ts` and `src/db/schema.ts` (the types and
constants `contour` depends on).
**Done when:**
- `computeContour` is pure and deterministic: a fixed `NoteEvent[]` fixture
  always yields the same `MelodyContour`.
- `intervals` are the consecutive integer semitone deltas; humming the same
  shape shifted by a constant number of semitones (any key/octave) yields
  identical `intervals`.
- `ioiRatios` are the consecutive inter-onset-interval ratios and are
  unchanged when every time value is scaled by a constant (tempo change).
- 0-, 1-, and 2-note inputs are handled without throwing (empty arrays where
  there are not enough notes).

### Task 2 — IndexedDB persistence layer
Implement `src/db/entries.ts` and wire `fake-indexeddb` into `tests/setup.ts`;
add the dev dependency.
**Done when:**
- The DB opens at version 1, creating the `entries` store (keyPath `id`) and
  the `byCreatedAt` index in `onupgradeneeded`.
- `saveEntry` assigns `id`/timestamps/`schemaVersion`, computes
  `contour = computeContour(notes)` internally, stores the audio `Blob`, and
  returns the full `Entry`.
- `getEntry` round-trips a stored entry, and the returned `audio` is a `Blob`
  whose bytes and type match what was saved.
- `listEntries` returns entries newest first and pages correctly with
  `limit`/`before`/`nextBefore`, never loading the whole store at once.
- `updateEntry` patches only title/tags/notationAbc and bumps `updatedAt`;
  `deleteEntry` removes; `countEntries` returns the count.
- Boundary validation rejects oversize titles/notation, too many tags,
  oversize or empty tags; tags are trimmed and de-duplicated.

### Task 3 — Router and app shell
Implement `src/router/useHashRoute.ts`, switch `src/App.tsx` on it, and add
`getSharedPlayer()`/`disposeSharedPlayer()` to `src/playback/player.ts`.
**Done when:**
- `#/` renders capture, `#/songbook` renders the songbook, `#/entry/:id`
  renders detail for that id, and an unknown hash redirects to `#/`.
- Browser back moves between views; deep-linking `#/entry/:id` directly loads
  that entry.
- Only one melody plays at a time across screens (shared player); the
  existing capture e2e and capture component test still pass.

### Task 4 — Save from capture
Wire the "Save to songbook" action into `CaptureScreen`'s `ready` phase,
retaining notes, the source blob, `audioMimeType`, and `durationSec`.
**Done when:**
- After a non-empty result, tapping Save persists an `Entry` (audio blob,
  notes, contour, `notationAbc`, an editable default title, empty tags) and
  gives feedback within 100ms.
- On success the user sees "Saved" and a way to the songbook.
- A save failure (including simulated quota) shows the designed save-error
  state with retry, never a raw error, and the app stays usable.

### Task 5 — Songbook screen
Implement `SongbookScreen` and `EntryRow` with designed empty, loading, and
error states and bounded pagination.
**Done when:**
- With no entries, the designed empty state shows its purpose and a primary
  "Record a hum" action.
- With entries, the list shows them newest first; each row plays the entry
  through the shared player (pressed state within 100ms) and opens its detail.
- The first render shows a loading state that holds layout, then real
  content; a load failure shows the designed error state.
- "Show more" appends the next page; the query stays bounded (cursor + limit)
  and the screen stays smooth with hundreds of entries.
- Usable at 390px: no horizontal scroll, 44px touch targets.

### Task 6 — Entry detail screen
Implement `EntryDetailScreen`, `TagEditor`, and `ConfirmDialog`.
**Done when:**
- The screen plays the entry, and renames persist and survive reopening.
- Tags can be added and removed, persist, and respect the validation limits.
- The draft notation can be edited, the edit persists, playback reflects the
  edit, and `notes`/`contour` are unchanged by the edit.
- Delete opens an accessible confirm dialog (focus moved in, Escape/Keep
  dismisses, focus returns); confirming removes the entry and returns to the
  songbook.
- A missing entry shows the designed not-found state; failures show the
  save-error state, never a raw error.
- Usable at 390px, inputs labeled, visible focus, keyboard reaches every
  control.

### Task 7 — Copy
Add every new string above to `src/copy/strings.ts` and use them from the new
components. No user-visible string is hardcoded in a component.
**Done when:** `tests/copy.test.ts` passes with the new strings, and a manual
read of the songbook, entry detail, and the delete dialog sounds human.

### Task 8 — Tests and end-to-end proof
See the test plan. All listed automated tests pass in the foreground.

---

## Test plan (which test proves each criterion)

Automated, run in the foreground to completion.

1. **`contour.test.ts` (vitest, unit)** — feed fixed `NoteEvent[]` fixtures
   and assert exact `MelodyContour` output; assert a key/octave shift leaves
   `intervals` unchanged and a tempo scale leaves `ioiRatios` unchanged;
   assert 0/1/2-note edge cases. *Proves the contour is deterministic,
   key-independent, and correctly derived from notes.*

2. **`entries.test.ts` (vitest + fake-indexeddb)** — save entries and assert:
   `getEntry` round-trips including the audio `Blob` (bytes and type);
   `saveEntry` stored a `contour` equal to `computeContour(notes)`;
   `listEntries` returns newest first and pages with `before`/`nextBefore`;
   `updateEntry` changes only title/tags/notationAbc and bumps `updatedAt`;
   `deleteEntry` removes; boundary validation rejects the oversize/invalid
   inputs. *Proves durable storage, newest-first bounded listing, edit/delete,
   contour-at-save, and boundary validation.*

3. **`captureSave.test.tsx` (vitest + Testing Library)** — mock the recorder,
   transcribe, decode, player, and `db/entries`. Drive a non-empty result,
   tap "Save to songbook", and assert `saveEntry` was called with the notes,
   `notationAbc`, audio blob, a non-empty title, and empty tags, and that the
   UI shows the saved confirmation. Also assert a rejected `saveEntry` shows
   the save-error state. *Proves the save path and its designed failure.*

4. **`songbookScreen.test.tsx` (vitest + Testing Library)** — mock
   `db/entries` and the player. Assert: empty result renders the designed
   empty state with the record action; a seeded list renders newest first
   with Play and open affordances; a row Play calls the shared player; "Show
   more" requests and appends the next page; a rejected `listEntries` renders
   the designed error state. *Proves the list, empty/error states, ordering,
   playback, and pagination.*

5. **`entryDetail.test.tsx` (vitest + Testing Library)** — mock `db/entries`,
   the player, and abcjs render. Assert: rename calls `updateEntry({title})`;
   adding and removing a tag calls `updateEntry({tags})` with validated
   values; editing notation calls `updateEntry({notationAbc})`; Delete opens
   the confirm dialog and confirming calls `deleteEntry` then navigates; a
   missing entry renders the not-found state. *Proves rename, tags, notation
   edit, and confirmed delete.*

6. **`copy.test.ts` (vitest, unit)** — the existing sweep flattens `strings`;
   the new strings are covered automatically. Keep it green. *Proves the copy
   sweep on all new strings.*

7. **`e2e/songbook.spec.ts` (Playwright, Chromium)** — at a 390px viewport,
   drive capture through the deterministic "Try an example" path to a `ready`
   result, tap "Save to songbook", navigate to the songbook and assert the
   entry appears, then **reload the page** and assert the entry is still
   listed (this is the strongest proof the entry lives in IndexedDB, not
   memory, and survives a reload; a browser restart reuses the same on-disk
   IndexedDB, so reload persistence is the load-bearing proof). Open the
   entry, assert its detail renders and Play is enabled, and assert no
   horizontal scroll at 390px. *Proves durability across reload, the songbook
   listing, and open/play end to end.* The existing `e2e/capture.spec.ts`
   must still pass unchanged.

Map back to the planner's acceptance criteria:
- Durable Entry (incl. audio blob) surviving reload/restart → Tests 2 and 7.
- Songbook newest-first, plays any entry, opens detail, smooth with hundreds
  (capped/paginated) → Tests 2, 4, and 7.
- Entry detail rename / add-remove tags / edit notation / delete with confirm
  → Test 5.
- Each saved Entry stores a contour derived from its notes → Tests 1 and 2.
- Empty songbook designed state pointing at recording → Test 4.
- Copy sweep passes on all new strings → Test 6.

---

## Definition of done for this EPIC
Every task above is complete; every listed automated test passes in the
foreground (including `contour`, `entries`, the three screen tests, the copy
sweep, and both Playwright specs); a hum saved from capture appears in the
songbook and is still there after a page reload; entries can be played,
renamed, tagged, notation-edited, and deleted behind a confirm; each saved
entry carries a contour derived from its notes; the empty songbook is a
designed state; and the app stays usable at 390px with designed empty,
loading, and error states throughout. No search UI, import, export, or
walkthrough has been added.
