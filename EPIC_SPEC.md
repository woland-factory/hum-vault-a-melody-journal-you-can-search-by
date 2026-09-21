# EPIC SPEC: Polish pass

## Quality differentiator (this app must win here)

**Recall of your own past ideas by ear.** Every other tool converts a hum once
and forgets it, or keeps recordings you can only find by name. Hum Vault is the
one place where a half-remembered fragment, hummed, returns the exact idea. We
win on retrieval by melody, and keep everything else deliberately simple to
protect it.

**What this EPIC owes the differentiator:** this is a refinement pass, not a
feature pass, so its duty to the differentiator is to prove and protect it, not
to extend it. Two things carry that weight. First, recall quality must be
*measured*, not asserted: the search matcher's top-3 behavior is pinned to a
fixed fixture of query hums, and any tuning stays inside the existing matcher
without adding surface. Second, recall must stay fast and reachable as the vault
grows: the search hot path must not degrade at hundreds of entries, and the
whole retrieval flow (hum to search, ranked results, play, open) must work on a
390px mobile-Safari-class browser, because that is where a musician actually
reaches for a half-remembered tune.

---

## Scope

This EPIC is a UX, performance, accessibility, and copy pass over the whole
delivered product (capture, songbook, search, entry detail, settings, import,
export, walkthrough, demo). It tightens what already ships against the QUALITY
BAR and the quality differentiator. It adds **no new features and no new user-
facing surface.** The planner marked this EPIC `polish: true`, and its scope is
a pure refinement pass; both agree.

Much of the bar is already met by the delivered code (paginated songbook reads,
a contour-only search read with a perf guardrail, `webkitAudioContext`
fallbacks, focus-visible styles, skeletons, centralized swept copy, a complete
README). For those areas the work is to *verify and lock in* the behavior with a
test that fails if it regresses, not to rebuild it. Where a real gap exists
(mobile-Safari/WebKit coverage, corpus-scale guards on a couple of hot paths,
small accessibility refinements), the work is to close it with the smallest
change that clears the bar.

### In scope

1. **Mobile-Safari / WebKit verification at 390px.** The five core flows
   (capture, save, search, import, export) run and are verified on a WebKit
   engine at a 390px viewport, and microphone capture is confirmed to negotiate
   a Safari-supported path. See T1 for the automatable proof and the documented
   manual iOS-device check.
2. **Perceived-speed tightening.** Every interactive control gives visible
   feedback within ~100ms of a tap (pressed/disabled/pending/optimistic), and no
   hot path (songbook list, search ranking) degrades as the corpus grows to
   hundreds of entries.
3. **Designed empty / loading / error states on every screen.** Each screen's
   three states render a designed surface with a next step, never a raw error,
   error code, stack, or dead end.
4. **Search ranking measured against a fixed fixture.** The documented top-3 bar
   is proven against `tests/fixtures/searchCorpus.ts`, and any tuning stays
   inside `src/melody/search.ts` with no new option or surface.
5. **Accessibility basics.** Visible focus on every interactive element, every
   input labeled, sufficient contrast, keyboard reaches every control, exactly
   one `<h1>` and a `<main>` landmark per screen, error surfaces announced
   assertively, the confirm dialog focus-trapped with Escape and focus restore.
6. **Full human-voice copy sweep across every screen.** No em-dash or en-dash,
   no banned LLM vocabulary, no negative empty-state phrasing in any user-visible
   string, and no user-visible string bypassing `src/copy/strings.ts`.
7. **README for strangers.** Understand, run (verified against the actual
   `Dockerfile` / `docker-compose.staging.yml` / `package.json` scripts), and
   contribute, with no pipeline jargon.

### Out of scope (binding non-goals)

- **Any new feature.** No new screen, control, format, setting, or capability.
  If a change would add user-facing surface, it is out of scope for this EPIC.
- **Gold-plating past the written bar.** No animations nobody specified, no
  design system for a handful of screens, no premature optimization beyond the
  budgets below, no re-architecture. Meeting the bar is in scope; exceeding it
  is drift.
- **Everything already fenced by the product plan** stays out: no accounts,
  server, cloud sync, polyphony, engraving-grade notation, commercial-catalog
  matching, sharing, lyrics, DAW features, native app, runtime LLM,
  monetization.
- **Changing the search algorithm's shape or adding matcher options/surface.**
  Tuning the existing constants to keep the fixture green is allowed; adding a
  new ranking mode, a second index, or a new public function is not.
- **Reworking the DB schema or bumping `DB_VERSION`.** The delivered v2 schema
  stands. This EPIC touches no migration.

---

## Technical design

The app is a client-only React + Vite + TypeScript SPA. State lives in
IndexedDB (`src/db/`). There is no server and no authenticated route. This EPIC
adds no runtime dependency, no schema change, and no network I/O. It changes
test infrastructure, adds regression tests, and makes small, surgical edits to
existing components/styles where a bar gap is found.

### Current state (verified) — what NOT to rebuild

The implementer must confirm each of these still holds and lock it with a test;
do not re-implement working behavior.

- **Paginated songbook reads.** `listEntries` (`src/db/entries.ts`) pages
  newest-first through the `byCreatedAt` index, 30 per page, returning
  `nextBefore`. It never scans the whole store for a page.
- **Cheap search read.** `listContours` returns only `{ id, title, contour }`
  per entry (no audio, no notes), capped at `MAX_SEARCH_CORPUS = 2000` with a
  count-only log past the cap. `rankMatches` (`src/melody/search.ts`) is a pure
  O(sum of contour lengths) scan; `tests/search.test.ts` already has a
  ~1000-contour guardrail under 500ms.
- **Safari audio groundwork.** `src/audio/decode.ts` and `src/playback/player.ts`
  both fall back to `webkitAudioContext` and `player.ts` calls
  `audioContext.resume()` on a suspended context. `src/audio/recorder.ts` tags
  the recorded blob with the real `recorder.mimeType` (so a Safari `audio/mp4`
  recording is labeled correctly), not a hardcoded type.
- **Designed states surface.** `StatusMessage` (`src/components/StatusMessage.tsx`)
  renders a titled, bodied, actioned surface for empty/error states; screens
  render skeletons (`.skeleton*` in `src/styles/app.css`) while loading.
- **Accessibility base.** Every screen renders `<main className="screen">` and
  one `<h1>` (exception: `EntryDetailScreen`, see the gap below); focus-visible
  outlines exist on `.btn`, `.link`, `.input`, `.entry-row__open`,
  `.tag-chip__remove`, `.walkthrough__skip`, and the file-input labels; inputs
  carry labels/aria-labels; `ConfirmDialog` uses `aria-labelledby`.
- **Centralized, swept copy.** All strings live in `src/copy/strings.ts`;
  `tests/copy.test.ts` sweeps them plus demo titles, the README, and
  `.env.example`.
- **README + deploy files.** `README.md` documents run-local, Docker, and
  Docker-compose paths; `Dockerfile`, `docker-compose.staging.yml`,
  `scripts/e2e.sh`, and `scripts/check-staging.sh` all exist.

### Confirmed gaps to close

1. **No WebKit / mobile-Safari test coverage.** `playwright.config.ts` defines a
   single `desktop` project (`Desktop Chrome`). The existing e2e specs run at a
   390px viewport but only under Chromium, and they drive the pipeline through
   the deterministic "Try an example" path (the live mic is never exercised in
   CI). Nothing verifies the app on the WebKit engine that mobile Safari uses.
2. **No corpus-scale guard on the songbook/search hot paths.** The perf
   guardrail covers the pure matcher, but there is no test proving the songbook
   list still reads only one page (and search stays under budget) with hundreds
   of saved entries end to end.
3. **Error surfaces are announced politely, not assertively.** `StatusMessage`
   and the capture/settings error lines use `role="status"` (aria-live polite)
   for both info and error tones. An error state should be `role="alert"`
   (assertive) so a screen reader announces the failure and its next step.
4. **`EntryDetailScreen` has no `<h1>`.** Its title is an editable `<input>`
   (`aria-label` "Title"), so the screen currently exposes no top-level heading,
   breaking the "one `<h1>` and semantic headings per screen" rule.
5. **`SearchScreen` non-results phases have no `<h1>`.** The results phase renders
   an `<h1>`, but the loading, empty-corpus, transcribing, no-match, no-notes, and
   error phases render only the back link plus a `StatusMessage` `<h2>`, leaving an
   orphan heading in those states.
6. **Toggle buttons lack `aria-pressed`.** The Play controls (`EntryRow`,
   `NotationView`) and the Record button convey their active/playing state with a
   CSS class and a label swap only, not `aria-pressed`.
7. **Songbook "Show more" has no pending state.** It sets `disabled` while loading
   but keeps the same label, with no in-place progress cue, so the "load more"
   tap has no visible pending feedback (a §1 gap).
8. **Minor announce gaps.** The `Walkthrough` step chip is `role="note"` (not a
   live region), so a step change is not announced; the `TagEditor` group label is
   a styled `<span>`, not a semantic label. Address only if cheap; neither adds
   surface.

### Files / modules to touch

**Test infrastructure (new / modified)**

- `playwright.config.ts` — add a **`mobile-safari`** project using a WebKit
  device descriptor at a 390px-wide viewport (e.g. `devices["iPhone 13"]` or an
  explicit `{ ...devices["Desktop Safari"], viewport: { width: 390, height: 800 } }`).
  Keep the existing `desktop` project. The Chromium-only launch args
  (`--use-fake-*-for-media-stream`) must not be applied to the WebKit project;
  scope them to `desktop` if they are moved onto a project.
- `scripts/e2e.sh` — ensure the pinned Playwright container run installs and
  exercises WebKit (the official image already ships it). If the script pins a
  browser install, add `webkit`. Do not change the container tag/pin otherwise.
- `tests/e2e/mobile-safari.spec.ts` (new) — the WebKit flow proof (T1).
- `tests/e2e/*.spec.ts` (existing) — no behavior change; they continue to run
  under `desktop`. Where a WebKit run needs a deterministic corpus without live
  model inference, seed via the existing `SEED_DEMO` path or a small
  IndexedDB seed helper rather than depending on model inference under WebKit
  (see T1 rationale). Do not add product code to support seeding beyond what
  already exists.
- `tests/perfHotPaths.test.ts` (new) — corpus-scale guard for the songbook and
  search reads (T2).
- Component test files (existing, extended): `tests/captureScreen.test.tsx`,
  `tests/songbookScreen.test.tsx`, `tests/searchScreen.test.tsx`,
  `tests/entryDetail.test.tsx`, `tests/settingsScreen.test.tsx`,
  `tests/importPanel.test.tsx`, `tests/walkthrough.test.tsx` — add the
  immediate-feedback, designed-state, and accessibility assertions (T2, T3, T5).
- `tests/recorder.test.ts` (new or fold into an existing audio test) — the
  Safari-safe MediaRecorder mime negotiation assertion (T1).
- `tests/copy.test.ts` (existing) — extend to guard against user-visible string
  literals bypassing `strings.ts` (T6), if that guard is not already implied.

**Product code (surgical edits only, where a gap is found)**

- `src/components/StatusMessage.tsx` — when `tone === "error"`, render
  `role="alert"` (assertive) instead of `role="status"`; keep `role="status"`
  for info/empty. No prop or API change beyond honoring the existing `tone`.
- `src/components/CaptureScreen.tsx`, `src/components/SettingsScreen.tsx` — the
  inline **error** lines that currently use `role="status"` become `role="alert"`.
  Success/progress lines stay `role="status"` / `aria-live="polite"`.
- `src/components/EntryDetailScreen.tsx` — add exactly one `<h1>` for the screen.
  The smallest fix: render the entry title as the screen `<h1>` above the rename
  field, or add a visually-hidden `<h1>` (e.g. reusing the existing detail
  heading copy) so the screen has a programmatic top-level heading. Do not add a
  new visible control or restructure the screen.
- `src/components/SearchScreen.tsx` — ensure every phase renders one `<h1>` (its
  non-results phases render only a `StatusMessage` `<h2>` today). Reuse the
  existing search heading copy; add no new visible control.
- `src/components/SongbookScreen.tsx` — give the **Show more** control an
  in-place pending state (disabled plus a pending label or cue) while the next
  page loads.
- `src/components/EntryRow.tsx`, `src/components/NotationView.tsx`,
  `src/components/RecordButton.tsx` — add `aria-pressed` to the Play/Record
  toggle buttons reflecting their active state. No visual change required.
- `src/components/Walkthrough.tsx`, `src/components/TagEditor.tsx` — optional
  announce/label refinements (AC5.5), only if cheap; no surface change.
- `src/audio/recorder.ts` — only if T1 shows a Safari gap: negotiate the
  MediaRecorder mime type with `MediaRecorder.isTypeSupported` (prefer a
  Safari-supported type such as `audio/mp4`, fall back to `audio/webm`, else let
  the browser default), and keep tagging the blob with the real
  `recorder.mimeType`. If the current default-constructor behavior already
  produces a decodable blob under WebKit, leave it and only add the guarding
  test. This is a correctness tightening, not a feature.
- `src/styles/app.css` — only if the a11y/contrast/touch-target audit (T5) finds
  a specific shortfall (a control under ~44px, an outline that does not show, a
  contrast pair below 4.5:1). Fix the specific rule; do not restyle broadly.
- `src/copy/strings.ts`, `README.md` — only if the sweep (T6/T7) finds a hit.

**No changes** to `src/db/schema.ts` (no migration), the search algorithm's
public API, or any data shape.

### Perceived-speed budgets (BINDING, per QUALITY BAR §1)

- **Immediate feedback (~100ms):** every control that starts async work must
  change appearance *synchronously* on the same event that starts the work,
  before the promise settles. Concretely: Record toggles to its recording state
  at once; Save disables and shows "Saving"; Play swaps to "Playing"/active;
  Export shows "Preparing your backup" and disables; Import shows "Restoring your
  ideas"; Delete confirm disables; Add-tag / Save-notation disable while
  pending. The `.btn:active` transform already gives a pressed cue; this budget
  is about the *pending* state, not just the press.
- **No hot-path degradation at scale:** rendering the first songbook page must
  read at most one page (`DEFAULT_PAGE_SIZE`) regardless of corpus size; search
  ranking over hundreds of contours stays well under the existing 500ms
  guardrail. Neither reads audio blobs or notes into memory on the hot path.

### Accessibility contract (BINDING, per QUALITY BAR §6)

- Exactly one `<h1>` per screen (fix `EntryDetailScreen`); `StatusMessage`
  titles stay `<h2>` under the screen `<h1>`.
- Each screen keeps its `<main>` landmark; the songbook top bar / nav controls
  stay reachable and labeled.
- Every interactive element has a visible focus indicator (already via
  `:focus-visible`); the audit confirms none was removed and the file-input
  labels keep their `focus-within` ring.
- Error states use `role="alert"`; progress/success use `aria-live="polite"`.
- `ConfirmDialog` traps focus while open, closes on Escape, and restores focus
  to the trigger on close; it exposes `role="dialog"` + `aria-modal="true"` +
  `aria-labelledby`. Verify and add whatever of this is missing.
- Text/background contrast is at least 4.5:1 for normal text and 3:1 for large
  text and UI borders; document the checked pairs (accent, muted, danger on
  `--bg`/`--surface`). No hit is expected from the current palette; record the
  ratios as proof.
- Keyboard reaches every control a pointer can: record, example, save, play,
  nav to songbook/search/settings, list rows, entry detail fields and actions,
  tag add/remove, import file picker, export/import, dialog buttons.

---

## Ordered task list (with acceptance criteria)

Each task's criteria are provable by the tests named in the Test plan. A
criterion is met only when its test passes **and** the surface clears the
quality bar.

### T1. Mobile-Safari / WebKit verification at 390px

Add a WebKit Playwright project and a spec that runs the core flows at 390px on
the WebKit engine, plus the Safari-safe recorder guarantee, plus a documented
manual iOS-device mic check.

- **AC1.1** `playwright.config.ts` defines a `mobile-safari` (WebKit) project at
  a 390px-wide viewport, alongside the existing `desktop` project, and
  `scripts/e2e.sh` runs it in the pinned container.
- **AC1.2** `tests/e2e/mobile-safari.spec.ts`, running under WebKit at 390px,
  verifies each of the five core flows works with no horizontal scroll:
  capture-to-notation (via the example pipeline), save, hum-to-search returning
  a ranked result, bulk import adds an entry, and export fires a `.zip`
  download. Where full on-device model inference is not reliably runnable under
  headless WebKit, the spec seeds a deterministic corpus (via `SEED_DEMO` or a
  small IndexedDB seed) so save/list/search/import/export are proven in the
  WebKit engine without depending on model timing; the model pipeline stays
  proven under `desktop`. The chosen split is stated in a comment at the top of
  the spec.
- **AC1.3** Microphone capture negotiates a Safari-supported path: a test proves
  `startRecording` produces a blob tagged with the actual `recorder.mimeType`
  (not a hardcoded `audio/webm`) and, where the environment reports supported
  types, prefers a Safari-supported type via `MediaRecorder.isTypeSupported`.
  `getUserMedia` denial and no-mic still resolve to the designed `mic-denied` /
  `no-mic` states under WebKit.
- **AC1.4** A `VERIFICATION.md` at the worktree root documents the manual
  physical-iPhone Safari check (open the deployed/staging URL on an iPhone, grant
  the mic, hum, confirm draft notation, save, hum-to-search, import a memo,
  export), stating plainly that a real iOS device is outside CI and this is the
  human step that closes AC "confirmed on iOS Safari specifically". The automated
  WebKit run (AC1.2/AC1.3) is the CI-provable proxy for the same engine.

### T2. Perceived speed: immediate feedback and no hot-path degradation

- **AC2.1** Every control that starts async work enters its pending/pressed
  state synchronously with the triggering event: a component test asserts the
  control is disabled or shows its pending label in the same tick the action is
  dispatched, before the underlying promise resolves. Covered controls: Save,
  Play, Export, Import, Delete confirm, Add tag, Save notation, the Record
  toggle, and the songbook **Show more** control (which currently disables
  without a pending label or cue and must show an in-place pending state).
- **AC2.2** Rendering the first songbook page reads at most one page from
  IndexedDB regardless of corpus size: a test seeds several hundred entries and
  asserts the initial `listEntries` reads `DEFAULT_PAGE_SIZE` rows and returns a
  non-null `nextBefore`, and that the render does not load audio/notes for
  off-page rows.
- **AC2.3** Search ranking over several hundred contours stays well under the
  documented budget (reuse/extend the existing sub-500ms guardrail) and reads
  only `{ id, title, contour }` per entry.

### T3. Designed empty / loading / error states on every screen

- **AC3.1** For each screen (capture, songbook, search, entry detail, settings,
  import panel) a test asserts its **empty**, **loading**, and **error** states
  render a designed surface: a heading, a body, and (where an action makes
  sense) a next-step control. Loading holds layout with a skeleton or an
  in-place spinner, never a blank region.
- **AC3.2** No error path surfaces a raw `Error.message`, error code, or stack:
  a test forces each screen's failure path (DB open failure, transcription
  failure, save failure, export/import failure, entry-not-found, search failure)
  and asserts the visible copy is the corresponding designed string from
  `src/copy/strings.ts`, not the thrown error's text.

### T4. Search ranking measured against the fixed fixture

- **AC4.1** `tests/search.test.ts` remains the documented measure of the top-3
  bar: a genuine transposed, tempo-scaled, slightly-imperfect fragment of a
  corpus melody ranks its entry in the top 3 (strong form: #1 for the exact
  case), and an unrelated query returns no match. This stays green.
- **AC4.2** Any tuning of `RHYTHM_WEIGHT`, `DEFAULT_MAX_SCORE`,
  `MIN_QUERY_STEPS`, or `DEFAULT_LIMIT` is justified by the fixture: the fixture
  is what proves a changed constant is right. No new public function, option, or
  index is added to `src/melody/search.ts`; its exported API is unchanged.
- **AC4.3** The top-3 bar and the fixture as its source of truth are documented
  (a short line in `README.md` under search, and referenced in this spec), so a
  stranger and a future agent know the recall claim is measured, not asserted.

### T5. Accessibility basics

- **AC5.1** Every screen exposes exactly one `<h1>` and keeps its `<main>`
  landmark, in every phase: fix `EntryDetailScreen` (no `<h1>` today) and
  `SearchScreen`'s non-results phases (loading, empty-corpus, transcribing,
  no-match, no-notes, error render only a `StatusMessage` `<h2>`). A test queries
  the top-level heading and the main landmark per screen and per state.
- **AC5.2** Error surfaces use `role="alert"`; progress/success use
  `aria-live="polite"`: a test asserts the tone-to-role mapping on
  `StatusMessage` and on the capture/settings inline error and success lines.
- **AC5.3** `ConfirmDialog` is `role="dialog"` + `aria-modal="true"` +
  `aria-labelledby`, traps focus while open, closes on Escape, and restores
  focus to the trigger on close: a test drives open, Tab-cycle containment,
  Escape-to-close, and focus restoration.
- **AC5.4** Every input is labeled and every control is keyboard-reachable and
  operable: a test walks each screen's controls by role/name and confirms the
  file-input labels keep a focus indicator. Documented contrast ratios for the
  accent, muted, and danger colors on `--bg` and `--surface` are recorded and
  each meets its threshold; any control below ~44px is fixed.
- **AC5.5** Toggle controls expose their state to assistive tech: the Play
  controls (`EntryRow`, `NotationView`) and the Record button carry
  `aria-pressed` reflecting active/recording, not just a class and label swap. If
  cheap, the `Walkthrough` step chip announces step changes (an `aria-live`
  region) and the `TagEditor` group uses a semantic label rather than a styled
  `<span>`. These are announce-only refinements and add no visible surface.

### T6. Full human-voice copy sweep across every screen

- **AC6.1** `tests/copy.test.ts` passes over every string in
  `src/copy/strings.ts`, the demo titles, `README.md`, and `.env.example`: no
  em-dash or en-dash, no banned LLM vocabulary, no negative empty-state phrasing.
- **AC6.2** No user-visible string bypasses `src/copy/strings.ts`: an audit of
  every component confirms rendered user-facing text is pulled from `strings`
  (interpolated via `fill` where counts appear), and any stray literal found is
  moved into `strings.ts` and swept. Code comments and non-UI strings are
  exempt.

### T7. README for strangers

- **AC7.1** A stranger can understand the app in the first two or three
  sentences (what it is, that audio stays on-device, that it searches your own
  hums by melody). No App Factory paths, agents, task types, or internal
  services appear anywhere in the README.
- **AC7.2** The run instructions are verified against the actual files: the
  local commands match `package.json` scripts, and the Docker / compose commands
  match `Dockerfile` and `docker-compose.staging.yml`. `scripts/check-staging.sh`
  is referenced accurately. Any drift between README and the real files is fixed.
- **AC7.3** The contribute section points at where the code lives (the
  `src/` layout) and how to run the tests (`npm test`, `bash scripts/e2e.sh`),
  and the README copy sweep (AC6.1) stays green.

---

## Quality bar mapping (BINDING)

- **Perceived speed (§1):** T2 — synchronous pending states on every async
  control; first songbook page reads one page; search stays under budget at
  hundreds of entries.
- **Mobile-first (§2):** T1 — the five core flows verified on WebKit at 390px
  with no horizontal scroll; T5 keeps touch targets ~44px.
- **Designed states (§3):** T3 — empty/loading/error designed on every screen,
  no raw errors, no dead ends.
- **First-run (§4):** unchanged. The delivered walkthrough and `SEED_DEMO` demo
  own first-run; this EPIC only verifies their states clear the bar (T3) and
  does not touch their behavior. No new walkthrough.
- **Security hygiene (§5):** client-only, no new routes, no network I/O; input
  is still validated at the storage boundary (unchanged). No PII in logs is
  preserved (the count-only `listContours` log stays count-only). This EPIC adds
  no logging.
- **Accessibility (§6):** T5 — one `<h1>` and a `<main>` per screen, labeled
  controls, visible focus, assertive error announcement, focus-trapped dialog,
  documented contrast, full keyboard reach.
- **Radically simple (§7):** unchanged surface. No control, word, or screen is
  added; the copy sweep (T6) keeps labels short and positive.
- **Copy (§8):** T6 — full sweep across every screen and the README, no string
  bypassing `strings.ts`.
- **README (§9):** T7 — understand / run / contribute, verified against the real
  files, no pipeline jargon.

---

## Test plan

Tests use the existing infra: Vitest + jsdom + `fake-indexeddb` (each file
resets the DB via `tests/setup.ts`), Testing Library for components, and the
pinned Playwright container (`scripts/e2e.sh`) for end-to-end, now across a
`desktop` (Chromium) and a `mobile-safari` (WebKit) project.

### Unit / component

- `tests/recorder.test.ts` (T1): with `MediaRecorder` and `getUserMedia`
  stubbed, `startRecording` produces a blob tagged with the actual
  `recorder.mimeType`; when supported types are reported it prefers a
  Safari-supported type; denial maps to `mic-denied` and no track maps to
  `no-mic`. Proves AC1.3.
- `tests/perfHotPaths.test.ts` (T2): seed several hundred entries; assert the
  first `listEntries` returns exactly `DEFAULT_PAGE_SIZE` rows with a non-null
  `nextBefore`; assert `listContours` returns rows carrying only
  `{ id, title, contour }`; time `rankMatches` over the seeded corpus under the
  documented budget. Proves AC2.2, AC2.3.
- Component tests (T2, T3, T5), extended in place:
  - `captureScreen.test.tsx`: Save/Play/Record show a synchronous pending or
    pressed state before the promise resolves (AC2.1); mic-denied, no-mic,
    empty-result, transcribe-error, and save-error render the designed strings,
    not raw text (AC3.1, AC3.2); inline error lines are `role="alert"`, success
    is `role="status"` (AC5.2).
  - `songbookScreen.test.tsx`: empty, loading (skeleton), and error states are
    designed (AC3.1, AC3.2); the list renders one page and a "Show more" control
    when more exist (AC2.2 at the component level).
  - `searchScreen.test.tsx`: no-match, no-notes, empty-corpus, and error states
    are designed (AC3.1, AC3.2); the results heading is the screen `<h1>`
    (AC5.1); Play swaps to its active label synchronously (AC2.1).
  - `entryDetail.test.tsx`: the screen exposes one `<h1>` (AC5.1); entry-not-found
    is designed (AC3.1); Save-notation and Add-tag disable while pending (AC2.1).
  - `settingsScreen.test.tsx`: storage-loading placeholder, export/import
    idle/working/done/error states are designed and export/import show a
    synchronous pending label (AC2.1, AC3.1, AC3.2); export error is
    `role="alert"` (AC5.2).
  - `importPanel.test.tsx`: per-file rows appear synchronously on choose/drop and
    reflect saved/skipped/failed with designed messages (AC2.1, AC3.1).
  - a shared `confirmDialog` test (extend `entryDetail.test.tsx` or add
    `tests/confirmDialog.test.tsx`): `role="dialog"`, `aria-modal`, focus trap,
    Escape-to-close, focus restore (AC5.3).
- `tests/search.test.ts` (T4, existing): the documented top-3 fixture stays
  green; the matcher's exported API is unchanged. Proves AC4.1, AC4.2.
- `tests/copy.test.ts` (T6, existing + extended): sweeps `strings`, demo titles,
  README, `.env.example`; add a guard/audit note that user-visible literals live
  in `strings.ts`. Proves AC6.1, AC6.2.

### End-to-end

- `tests/e2e/mobile-safari.spec.ts` (T1), WebKit at 390px: the five core flows
  with no horizontal scroll, seeding a deterministic corpus where model inference
  is not reliable under headless WebKit (rationale in a header comment). Proves
  AC1.1, AC1.2. The existing `desktop` specs continue to prove the full model
  pipeline (capture-to-notation, save, hum-to-search) under Chromium at 390px.
- The a11y keyboard-reach walk (AC5.4) is covered at the component level by
  role/name queries; an optional e2e keyboard pass may reinforce it but is not
  required to prove the criterion.

### Manual (documented, non-CI)

- `VERIFICATION.md` (T1): the physical-iPhone Safari checklist for the mic path,
  explicitly flagged as outside CI. This documents the human step that closes
  "microphone capture confirmed on iOS Safari specifically"; the WebKit e2e is
  the automatable engine-level proxy.

A criterion is met only when its automated test passes **and** the surface
clears the quality bar (mobile layout, designed states, accessible, swept copy).

---

## Open decisions resolved (so the implementer does not have to ask)

- **iOS Safari mic verification:** WebKit at 390px is the CI-provable engine
  proxy (AC1.2/AC1.3); a real iPhone check is documented in `VERIFICATION.md`
  (AC1.4). Do not attempt to fake a live iOS device in CI.
- **WebKit + model inference:** if headless-WebKit on-device inference is flaky
  or too slow, seed a deterministic corpus for the WebKit flows and keep the
  full model pipeline proven under Chromium; state the split in the spec header
  comment. This is a test decision, not a product change.
- **Error announcement:** error tone uses `role="alert"`; info/progress uses
  `aria-live="polite"`. This is the only `StatusMessage` change and it adds no
  prop.
- **EntryDetail heading:** add exactly one `<h1>` (visible title or
  visually-hidden), no new control.
- **Recorder mime:** prefer a Safari-supported type via `isTypeSupported`, keep
  tagging the blob with `recorder.mimeType`; leave the default path if WebKit
  already produces a decodable blob and only add the test.
- **Search tuning:** allowed only inside `src/melody/search.ts`'s existing
  constants, proven by the fixture; the exported API is frozen.
- **No new dependency, no schema change, no new user-facing surface.**
