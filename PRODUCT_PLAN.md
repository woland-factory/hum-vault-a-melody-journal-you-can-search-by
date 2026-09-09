# PRODUCT PLAN — Hum Vault

A free, no-login, in-browser melody journal. You hum a tune, it becomes
playable draft notation on the spot, every idea joins a private songbook on
your own device, and when you can only remember a fragment of an old idea you
hum it back and the app finds the entry.

---

## Core value (one sentence)

Turn every hummed tune into a private, playable songbook you can search by
humming, so no melodic idea you ever had is lost.

## North star

No melodic idea you ever had is lost. Every tune you hum lands in a songbook
that feels like an extension of your own memory: you summon any past idea by
humming the fragment you still remember, and it plays back instantly, in tune,
close to what you meant. The vault grows more valuable every week because it
holds years of your ideas and can hand any of them back the moment a melody
crosses your mind. It should feel less like software and more like perfect
recall for the tunes in your head.

## Quality differentiator (the one dimension we win on)

**Recall of your own past ideas by ear.** Every other tool either converts a
hum once and forgets it, or keeps recordings you can only find by name. Hum
Vault is the one place where a half-remembered fragment, hummed, returns the
exact idea. We win on retrieval by melody. Everything else stays deliberately
simple to protect that one capability, and we invest depth in the melodic
index rather than in engraving-quality notation.

## Signature moment

Weeks after you hummed it, you think "I had a good bridge idea in the
spring." You hum the three notes you still remember, and your own past idea
surfaces at the top of the results and plays itself back. No product at any
price does this today.

---

## MVP user stories

1. As a first-time visitor, I hum into the page and see playable draft
   notation within a few seconds, with no account and nothing uploaded.
2. As a user, I save a hum as an entry in my songbook, keeping the original
   audio plus its transcription and a melody index.
3. As a user, I browse my songbook and play back any entry.
4. As a user, I hum a fragment and get my past entries ranked by melodic
   similarity, and I play the closest match.
5. As a user with a backlog, I drag in my existing voice-memo files and the
   app transcribes and melody-indexes all of them on my device.
6. As a user, I export my whole vault as a zip (audio plus MusicXML and MIDI
   per idea) and re-import it later, so an evicted browser cannot lose my work.
7. As a user, I rename and tag an entry, fix obvious notation errors in the
   draft, and delete entries I do not want.

## Data model sketch

All state lives on the device in IndexedDB. There is no server database and no
account.

- **Entry**
  - `id` (uuid), `title`, `createdAt`, `updatedAt`
  - `audio` (original recording blob, e.g. webm/wav), `durationSec`
  - `notes[]` — transcribed melody: `{ midiPitch, startSec, durationSec }`
  - `contour[]` — search index: sequence of pitch intervals and coarse
    rhythm ratios derived from `notes`, normalized for key-independent match
  - `notationAbc` — editable draft notation source (ABC), regenerated from
    `notes` and user edits
  - `tags[]`
- **Settings / meta** — first-run-complete flag, demo-seeded flag, schema
  version (for export/import migration).

## Screen / route inventory

Client-only single-page app. No server API. A route is a client view.

- `/` — Capture. Record button, live pitch feedback, resulting draft
  notation, play, save. This is the first-minute-of-value screen.
- `/songbook` — the list of saved entries with a prominent "hum to search"
  control. Empty state that teaches and points at the record button.
- `/entry/:id` — entry detail: notation, playback, rename, tags, edit draft
  notation, export this entry, delete.
- `/search` — hum-to-search: capture a query hum, show ranked matches, play a
  match, open its entry.
- `/import` — drag-and-drop bulk import of voice-memo files with per-file
  progress.
- `/settings` — full vault export and re-import, storage usage, clear vault.

Container serves the static build plus a `/healthz` for the deploy check.
There are no authenticated server routes because there is no server and no
data ever leaves the device.

---

## EPIC list (build order)

Each EPIC is small and independently reviewable. Acceptance criteria are
testable, and every EPIC must clear the QUALITY BAR (mobile-first at 390px,
designed empty/loading/error states, fast first render, accessible controls,
human-sounding copy) for the surfaces it delivers.

### EPIC 1 — Capture to notation, and the deploy scaffold

**Scope:** Stand up the app shell and the first minute of value. Capture
microphone audio in the browser, transcribe a monophonic hum with the bundled
on-device model (`@spotify/basic-pitch`), render the result as playable draft
notation (abcjs), and play it back. Wire error tracking (`SENTRY_DSN`) and
analytics (`UMAMI_WEBSITE_ID` / `UMAMI_URL`) from env. Ship the staging deploy
scaffold.

**Acceptance criteria:**
- A `Dockerfile` builds the app and serves the static bundle; a
  `docker-compose.staging.yml` brings the app up locally and exposes
  `/healthz` returning 200. This is a shipping blocker and is owned here.
- On a 390px viewport, a first-time visitor can hum and, within a few seconds
  of finishing, see draft notation for a simple monophonic hum and hear it
  play back. No account, no upload, no horizontal scroll.
- Microphone permission denial is a designed error state that says what to do
  next, not a dead end or raw error.
- First meaningful render shows real content within about one second; capture
  and transcription show in-place progress, never a white screen.
- The UI states plainly that transcription is a monophonic draft and that
  audio stays on the device.
- `SENTRY_DSN` (backend/frontend where applicable) and Umami analytics load
  from env only; no secrets in the bundle or git.
- Copy sweep passes: no em-dashes, no banned LLM vocabulary, no negative
  empty-state phrasing in any shipped string.

**Non-goals for this EPIC:** persistence, search, import, export, walkthrough.

### EPIC 2 — The songbook (persistence)

**Scope:** Save a captured hum as an Entry in IndexedDB with its audio,
transcribed notes, computed melody contour, and draft notation. Browse the
songbook, open an entry, play it, rename, tag, edit the draft notation, and
delete. Compute and store the `contour` index at save time so search (EPIC 3)
is instant.

**Acceptance criteria:**
- Saving a hum creates a durable Entry that survives a page reload and
  browser restart (IndexedDB), including the original audio blob.
- The songbook lists entries newest first, plays any entry, and opens entry
  detail. The list is capped or virtualized so it stays smooth with hundreds
  of entries.
- Entry detail supports rename, add/remove tags, edit the draft notation, and
  delete with a confirm step.
- Each saved Entry stores a `contour` index derived from its notes.
- The empty songbook is a designed state that tells the user what the screen
  is for and points them at recording their first idea.
- Copy sweep passes on all new strings.

**Non-goals for this EPIC:** the search algorithm and results UI, import,
export, walkthrough.

### EPIC 3 — Hum to search (the signature)

**Scope:** The differentiator. Capture a short query hum, compute its contour,
match it against every entry's stored contour using interval-and-rhythm
contour comparison with dynamic time warping, and return entries ranked by
melodic similarity. Play a result in place and open its entry. This is the
depth investment: tune the matcher so a genuine fragment of a real entry
reliably ranks it near the top.

**Acceptance criteria:**
- From the songbook, a user hums a fragment and gets a ranked result list
  within about one second of finishing (brute-force contour match over the
  local corpus; no server, no vector database).
- Matching is key-independent: humming the same shape in a different octave or
  starting pitch still ranks the correct entry near the top.
- On a seeded corpus, humming a recognizable fragment of a known entry ranks
  that entry in the top 3 in a documented test fixture. If it does not, the
  EPIC is not done.
- A search that finds nothing is a designed empty state that suggests humming
  a longer or clearer fragment, not a blank screen.
- Results show enough to identify each match (title, a play control) and let
  the user open the full entry.
- Copy sweep passes.

**Non-goals for this EPIC:** import, export, walkthrough, matching against any
external or commercial catalog.

### EPIC 4 — Bulk import and vault backup

**Scope:** The cold-start solution and the durability promise, both required
in v1. Drag a folder or set of voice-memo files onto the app; it decodes,
transcribes, and melody-indexes each on the device with visible per-file
progress, then adds them as entries. Full vault export to a single zip
(original audio plus MusicXML and MIDI per idea, plus a manifest) and
re-import of that zip.

**Acceptance criteria:**
- A user can drop multiple audio files and watch each transcribe and save with
  clear progress; failures on one file are reported per file and do not abort
  the batch.
- Imported audio is validated at the boundary (type and size) before
  decoding; unsupported files get a clear, per-file message.
- Full export produces a downloadable zip containing, per entry, the original
  audio, a MusicXML file, and a MIDI file, plus a manifest with titles, tags,
  and timestamps.
- Re-importing an exported zip restores entries faithfully, including notes,
  contour, tags, and audio, and is idempotent enough not to silently
  duplicate on a repeated import of the same file.
- Storage usage is visible in settings, and export is reachable in two taps
  from the songbook so backing up before eviction is easy.
- Copy sweep passes.

**Non-goals for this EPIC:** cloud sync, sharing links, server storage.

### EPIC 5 — Guided first run and demo seed

**Scope:** Walk a brand-new user through their first success, and make the
staging deploy demonstrate the differentiator without a live microphone.
A short guided path (2 to 4 steps) anchored to the real controls leads the
user to capture, save, and hum-search once. Honor the `SEED_DEMO` convention:
when enabled, seed a small demo songbook of sample hummed ideas on first load
so a visitor can hear playback and run a hum-search that returns a real hit
within a minute.

**Acceptance criteria:**
- A first-time user sees a guided path of 2 to 4 steps, each one short
  imperative sentence anchored to the real control (record, save, hum to
  search). It is skippable at every step.
- The walkthrough appears only until the user's first successful save-and-
  search and never again; a returning user (flag set in IndexedDB) never sees
  it.
- With `SEED_DEMO` enabled, the app seeds a demo songbook whose entries play
  back real melodies and whose contours make a scripted hum-search return a
  non-empty top result. A seeded demo that yields zero results does not count.
- The demo seed is clearly separable from the user's own data and can be
  cleared without touching real entries.
- Copy sweep passes on all walkthrough and demo strings.

**Non-goals for this EPIC:** new capture, search, or storage features; this
EPIC only guides and demonstrates what already exists.

### EPIC 6 — Polish pass (polish)

**Scope:** A UX and performance pass over the whole delivered product against
the QUALITY BAR and the quality differentiator. No new features. Tighten what
exists: transcription and search accuracy tuning within the current design,
mobile Safari microphone capture verified on an iPhone-class viewport,
perceived-speed budgets met on every hot path, accessibility and focus states,
and a full human-voice copy sweep across every screen.

**Acceptance criteria:**
- Verified on a 390px viewport in mobile Safari: capture, save, search,
  import, and export all work, with microphone capture confirmed on iOS
  Safari specifically.
- Every interaction gives feedback within about 100ms (pressed states,
  optimistic saves, in-place progress); no hot path degrades as the corpus
  grows (search and list stay smooth at hundreds of entries).
- Every empty, loading, and error state across all screens is designed and on
  brand, with no raw errors or dead ends.
- Search ranking quality is measured against a fixed fixture of query hums and
  meets the documented top-3 bar; any tuning stays within the existing
  matcher, adding no new feature surface.
- Accessibility basics pass: visible focus states, labeled controls,
  sufficient contrast, keyboard reaches every control, semantic headings and
  landmarks.
- A full copy sweep across every screen finds and fixes any em-dash, banned
  LLM vocabulary, or negative empty-state phrasing.
- The README lets a stranger understand, run (verified against the actual
  compose files), and contribute to the app, with no pipeline jargon.

---

## Non-Goals / Out of scope

These are the fences that keep the build from drifting. None of them ship in
v1, even if tempting or easy.

- **No accounts, no server storage, no cloud sync.** Everything lives on the
  device. Audio never leaves it.
- **No polyphony.** Monophonic melody only. Chords, harmony, beatboxing, and
  multi-voice transcription are out, and the UI says so.
- **No engraving-grade notation.** Notation is an editable draft. We do not
  build a full score editor, layout engine, or print-perfect engraving.
- **No commercial-catalog matching.** We never try to identify what published
  song a hum is. Search is only over the user's own corpus.
- **No collaboration, sharing links, or social features.**
- **No lyrics or speech transcription.** We index melody, not words.
- **No DAW features.** No mixing, effects, multitrack, or instrument
  synthesis beyond simple playback of the transcribed melody.
- **No native mobile app.** Mobile browser is the target.
- **No runtime LLM.** The core loop uses a bundled on-device model. There is
  no BYOK surface and no gateway request, so the first moment of value has no
  key-paste friction.
- **No monetization, tiers, or usage caps.** The songbook is uncapped and
  free.

---

## Buildability and cost notes for the build agents

- Transcription: `@spotify/basic-pitch` (TensorFlow.js, Apache-2.0), runs
  fully in-browser. This is the modern on-device model that answers the HN
  thread's accuracy critique.
- Notation and playback: `abcjs` (render, edit, and play draft notation).
- Search: interval-and-rhythm contour comparison with dynamic time warping,
  plain JavaScript, brute force over the local corpus. No server, no vector
  database.
- Storage: IndexedDB for entries and audio blobs; zip export/import for
  backup.
- Hosting: static site. The staging container just serves the build. Running
  cost is approximately zero.
- Hardest problem, scoped accordingly: rhythm quantization of free-time
  humming. Present notation as an editable draft and invest matching depth in
  the melodic index (the signature), not in engraving.
