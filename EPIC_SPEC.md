# EPIC SPEC — Capture to notation, and the deploy scaffold

> This is EPIC 1 of Hum Vault. It stands up the app shell and the first
> minute of value: hum into the page, get a playable draft of notation,
> hear it play back. It also ships the staging deploy scaffold. No
> persistence, no search, no import, no export, no walkthrough.

---

## Quality differentiator (restate at the top of every spec)

**Recall of your own past ideas by ear.** Hum Vault wins on retrieval by
melody: a half-remembered fragment, hummed, returns the exact past idea.
Everything else stays deliberately simple to protect that one capability.

**What this EPIC owes the differentiator:** this EPIC does not implement
search, but it produces the raw material search will later depend on: the
per-note transcription (`{ pitchMidi, startSec, durationSec }`) that EPIC 2
turns into a stored melody contour and EPIC 3 matches against. So the
transcription pipeline here must emit clean, ordered, monophonic note
events, not just a picture. If the notes are wrong, every later EPIC
inherits the error. Get the note extraction honest and correct even where
the rhythm of the draft notation stays rough. Depth goes into faithful note
events, not into engraving.

---

## Scope

### In scope
- A client-only single-page web app (no server, no database, no account).
- The **Capture screen** (`/`) and only that screen:
  - Record microphone audio in the browser.
  - Transcribe a monophonic hum on-device with `@spotify/basic-pitch`.
  - Convert the transcribed notes to draft **ABC notation** and render it
    with `abcjs`.
  - Play the draft back through the browser.
  - A disclaimer that transcription is a monophonic draft and that audio
    stays on the device.
  - Designed empty / loading / error states for the whole flow, including
    microphone-permission denial.
- Runtime configuration from environment: `SENTRY_DSN`, `UMAMI_WEBSITE_ID`,
  `UMAMI_URL`. Wired so no secret is ever committed or baked into the
  bundle.
- The staging deploy scaffold: a `Dockerfile` that builds the app and
  serves the static bundle, and a `docker-compose.staging.yml` that brings
  it up locally and exposes `/healthz` returning HTTP 200.
- A `README.md` a stranger can use to understand, run, and contribute.

### Out of scope (binding non-goals — do NOT build)
- **Persistence / IndexedDB storage.** The captured hum lives in memory for
  the session only. There is no Save button and no songbook in this EPIC.
- **Melody search** and any contour matching UI.
- **Bulk import** (drag-and-drop of files).
- **Export / backup** (zip, MusicXML, MIDI download).
- **First-run walkthrough** and **demo seed** (`SEED_DEMO`). Both belong to
  EPIC 5. See the note below on why deferring the walkthrough does not
  breach the quality bar.
- Notation **editing**, rename, tags, delete (EPIC 2).
- Any runtime LLM, BYOK surface, or gateway call. The product plan lists
  "no runtime LLM" as a hard non-goal.
- Engraving-grade notation, tempo/key detection depth, polyphony.

### The walkthrough non-goal vs. the quality bar (read this before building)
QUALITY BAR §4 asks for a guided first-run path. The product plan
deliberately sequences that guided path and the demo seed into EPIC 5 and
lists "walkthrough" as a non-goal here. This is not a bar-vs-scope conflict:
the app is not "shipped" at the end of this EPIC, and a single-screen
capture flow with one obvious action is self-explanatory under §7 without a
tour. **Do not build a walkthrough, coach marks, tour library, or an
onboarding checklist in this EPIC.** Meet §4's intent the honest way for a
one-action screen: the primary action is unmistakable, an example is one tap
away (see the "Try an example" task), and the disclaimer sets expectations.
If during build you believe a true conflict exists, stop and set the run
`blocked` with the precise question rather than building a non-goal.

---

## Technical design

### Stack (locked, so the implementer does not have to choose)
- **Language / framework:** TypeScript + React 18, built with **Vite**.
- **Transcription:** `@spotify/basic-pitch` (TensorFlow.js, on-device).
- **Notation render + playback:** `abcjs` (`renderAbc` + `synth`).
- **Tests:** `vitest` + `@testing-library/react` + `jsdom` for unit and
  component tests; **Playwright** (Chromium) for the one end-to-end capture
  proof using fake audio capture.
- **Static serve in the container:** nginx (Alpine).

Keep the dependency set to the above plus their transitive needs. Do not add
a router (there is only one screen), a state-management library, or a UI kit.
Plain React state and hand-written CSS (or CSS modules) are the right size.

### Files / modules to create

```
/
  Dockerfile                      multi-stage: node build -> nginx serve
  docker-compose.staging.yml      brings up the app, healthcheck on /healthz
  docker-entrypoint.sh            renders env.js from env, then execs nginx
  nginx/nginx.conf                serves SPA + `location = /healthz`
  .env.example                    placeholders only, committed
  .dockerignore
  package.json  vite.config.ts  tsconfig.json  index.html
  public/
    env.js                        dev fallback: window.__HUMVAULT_ENV__ = {}
    model/                        basic-pitch model.json + weights (self-hosted)
    soundfont/                    self-hosted abcjs instrument samples
  src/
    main.tsx  App.tsx
    config/env.ts                 reads window.__HUMVAULT_ENV__, safe defaults
    telemetry/sentry.ts           init only if SENTRY_DSN present
    telemetry/analytics.ts        inject Umami only if id + url present
    audio/recorder.ts             getUserMedia + capture to an AudioBuffer
    audio/decode.ts               decode + downmix to mono + resample to 22050
    transcribe/basicPitch.ts      load model once, run, return NoteEvent[]
    transcribe/types.ts           NoteEvent = { pitchMidi, startSec, durationSec }
    notation/notesToAbc.ts        quantize + convert NoteEvent[] -> ABC string
    playback/player.ts            abcjs synth wrapper (init, play, stop)
    copy/strings.ts               every user-visible string, one place
    components/CaptureScreen.tsx  orchestrates the flow + state machine
    components/RecordButton.tsx   primary action, all record states
    components/NotationView.tsx   renders ABC, hosts Play
    components/StatusMessage.tsx  loading / progress / error / empty surfaces
    styles/*.css
  tests/
    notesToAbc.test.ts
    env.test.ts
    telemetry.test.ts
    captureScreen.test.tsx
    copy.test.ts
    e2e/capture.spec.ts           Playwright, fake audio capture
    fixtures/simple-hum.wav       a short clean monophonic hum
  scripts/
    check-staging.sh              build image, compose up, curl /healthz, grep bundle for secrets
```

There is **no data model migration** in this EPIC: nothing is persisted.
The in-memory transcription result is the `NoteEvent[]` type above, which is
the forward-compatible shape EPIC 2 will store.

### The capture state machine (single source of truth in `CaptureScreen`)
Model the flow as one explicit state so every branch has a designed surface:

`idle` → (tap Record) → `requesting-mic`
  - denied → `mic-denied`
  - no device → `no-mic`
  - granted → `recording`
`recording` → (tap Stop, or auto-stop at a max length) → `transcribing`
`transcribing`
  - model still warming → show progress in place (never a white screen)
  - notes found → `ready`
  - zero notes → `empty-result`
  - thrown error → `error`
`ready` → (tap Play) plays; (tap Record another) → `idle`

Rules:
- The app shell (heading, tagline, disclaimer, the Record button) renders on
  first paint in `idle`, before the model or mic touch anything. This is what
  satisfies "real content within about one second".
- Load the TensorFlow.js model **lazily in the background** right after first
  paint (or on the first Record tap). If the user taps Record before the
  model is ready, stay in a progress state with in-place feedback; do not
  block first paint on the model download.
- A hard cap on recording length (spec: **15 seconds**) with a visible
  countdown or elapsed indicator, auto-stopping at the cap. This keeps
  transcription fast and bounded.

### Audio pipeline (`audio/` + `transcribe/`)
1. `recorder.ts`: request `getUserMedia({ audio: true })`. Distinguish
   `NotAllowedError`/`SecurityError` (→ `mic-denied`) from
   `NotFoundError`/no track (→ `no-mic`). Capture with `MediaRecorder` (or
   Web Audio capture) into a Blob, stop cleanly, and release the mic track
   (`track.stop()`) when done so the browser mic indicator turns off.
2. `decode.ts`: `AudioContext.decodeAudioData` the recording, downmix to
   mono, and **resample to 22050 Hz** `Float32Array` (basic-pitch expects
   22050 Hz mono). Do the resample with an `OfflineAudioContext` at 22050 or
   an equivalent. This step is a common gotcha; get it right.
3. `basicPitch.ts`: construct `BasicPitch` once with the self-hosted model
   URL (`/model/model.json`), run `evaluateModel`, then
   `outputToNotesPoly` → `addPitchBendsToNoteEvents` → `noteFramesToTime`.
   Map the result to `NoteEvent[]` = `{ pitchMidi, startSec, durationSec }`.
   Enforce monophony for the draft: sort by `startSec`; if a note starts
   before the previous note ends, clip the previous note's end to the new
   start (keep both, no overlap). Drop notes shorter than a small floor
   (spec: 60 ms) as noise.

### Notation conversion (`notation/notesToAbc.ts`) — a deterministic draft
Rhythm quantization of free-time humming is the hardest problem in the whole
product, and the plan scopes it as a **draft on purpose**. Keep it simple,
deterministic, and testable. Do not build tempo or key detection.

Fixed draft grid:
- Header: `X:1`, `M:4/4`, `L:1/16`, `Q:1/4=120`, `K:C`.
- Grid unit = one sixteenth = `0.125 s` (from Q:1/4=120). Quantize each
  note's `durationSec` to the nearest whole number of sixteenths, minimum 1.
- Emit a rest when the gap between one note's end and the next note's start
  is at least half a grid unit, quantized the same way.
- Pitch: map `pitchMidi` chromatically to ABC using **sharps**. Middle C
  (MIDI 60) is ABC `C`; MIDI 72 is `c`; below C4 add commas, above C5 add
  apostrophes; sharps use the `^` prefix. Provide a pure
  `midiToAbcPitch(midi: number): string` function.
- Bar the output into `M:4/4` measures (insert `|` every 16 sixteenths of
  emitted duration); a trailing partial bar is fine for a draft.

This function must be **pure and deterministic** so a fixed `NoteEvent[]`
fixture always yields the same ABC string. That determinism is what the unit
test pins.

### Playback (`playback/player.ts`)
- Use `abcjs` `synth.CreateSynth` seeded from the rendered visual object
  (`renderAbc` returns the tune object `synth` needs).
- Self-host the soundfont under `/soundfont/` and point abcjs at it so
  playback does not depend on an external CDN and works on the deployed
  origin. Playback of a monophonic melody needs only one instrument.
- Playback must start within ~100 ms of the Play tap as perceived by the
  user: show a pressed/active state immediately, initialize the synth on
  first Play, and keep it warm for replays.
- If synth init or audio-context resume fails, surface the designed
  playback error (below) with a retry; never a raw error or a dead Play
  button.

### Runtime environment injection (no secrets in bundle or git)
Because this is a static bundle, environment values must be injected **at
container start**, not at build time:
- `docker-entrypoint.sh` reads `SENTRY_DSN`, `UMAMI_WEBSITE_ID`, `UMAMI_URL`
  from the environment and writes `/usr/share/nginx/html/env.js`:
  ```js
  window.__HUMVAULT_ENV__ = {
    SENTRY_DSN: "…",
    UMAMI_WEBSITE_ID: "…",
    UMAMI_URL: "…"
  };
  ```
  Any unset value is written as an empty string. Then `exec nginx`.
- `index.html` loads `/env.js` with a plain `<script>` **before** the app
  bundle. `public/env.js` ships a committed dev fallback that sets
  `window.__HUMVAULT_ENV__ = {}` so local dev works; the entrypoint
  overwrites it in the container.
- `config/env.ts` reads `window.__HUMVAULT_ENV__` with safe defaults and
  never throws when values are missing.
- `.env.example` documents the three variables with placeholder values only.
  No real DSN, id, or URL is ever committed.

Note: `SENTRY_DSN`, `UMAMI_WEBSITE_ID`, and `UMAMI_URL` are client-side
identifiers by design, not credentials; the requirement is that they arrive
from the environment and are not committed or hardcoded, which the runtime
`env.js` generation satisfies. `INTERNAL_SERVICE_KEY` and any true secret
are never referenced by this client app.

### Telemetry wiring
- `telemetry/sentry.ts`: if `SENTRY_DSN` is non-empty, initialize
  `@sentry/browser` with it; otherwise do nothing. Never log PII (no audio,
  no note data in breadcrumbs). If absent, the app runs normally.
- `telemetry/analytics.ts`: if both `UMAMI_WEBSITE_ID` and `UMAMI_URL` are
  non-empty, inject the Umami script tag (`src=UMAMI_URL`,
  `data-website-id=UMAMI_WEBSITE_ID`, `defer`); otherwise do nothing.

### nginx / healthz
- `nginx.conf`: serve the SPA (`try_files $uri /index.html`) and add
  `location = /healthz { return 200 "ok"; add_header Content-Type text/plain; }`.
- `docker-compose.staging.yml`: build the image, publish a port, and set a
  `healthcheck` that curls `http://localhost/healthz`.

### Security / quality-bar notes specific to this EPIC
- There are no server routes and no auth to enforce (client-only, no data
  leaves the device), so QUALITY BAR §5's server-side authorization clause is
  satisfied vacuously. State this in the README so a reviewer is not left
  guessing. The relevant hygiene here is: microphone permission handled
  gracefully, recording length bounded (the 15 s cap), no secrets in the
  bundle or git, and no PII in logs.
- Input validation at the boundary: guard against decode failures and
  empty/too-short recordings with designed states, not throws.

---

## User-visible copy (write these verbatim; already swept)

Centralize these in `src/copy/strings.ts`. They are pre-swept for em-dashes,
banned LLM vocabulary, and negative empty-state phrasing. If you change a
string, re-sweep it.

- App heading: `Hum Vault`
- Tagline: `Hum a tune and see it as notation, right on your phone.`
- Disclaimer (satisfies the monophonic + on-device criterion):
  `Your audio stays on this device. The notation is a rough draft of one melody line.`
- Record button, idle: `Record a hum`
- Record button, recording: `Stop` (with a visible elapsed/countdown to 15s)
- Model warming progress: `Getting ready`
- Transcribing progress: `Reading your hum`
- Play button: `Play`
- Start over: `Record another`
- Try the example action: `Try an example`
- Mic denied state:
  - title: `Turn on the microphone`
  - body: `Hum Vault listens on this device to turn your hum into notation. Allow microphone access for this site in your browser, then record again.`
  - action: `Try again`
- No microphone found:
  - title: `Connect a microphone`
  - body: `Plug in or enable a microphone, then reload to record.`
- Empty result (a hum with no clear notes):
  - title: `Let's try that again`
  - body: `Hum one clear note at a time and hold each a beat longer, then record again.`
  - action: `Record another`
- Transcription error:
  - title: `Record that again`
  - body: `Check your microphone and record again.`
  - action: `Record another`
- Playback error:
  - title: `Playback stopped`
  - body: `Tap play to start it again.`
  - action: `Play`

---

## Ordered task list (with acceptance criteria)

### Task 1 — Project scaffold and app shell
Set up Vite + React + TS, `index.html` (loading `/env.js` before the
bundle), base styles, and a Capture screen that renders the heading,
tagline, disclaimer, and the Record button on first paint.
**Done when:**
- `npm run dev` serves the app; `npm run build` produces a static bundle.
- On load (390px viewport), the user sees heading, tagline, disclaimer, and
  an obvious single primary Record button, with no horizontal scroll and no
  blank screen. First meaningful render is real content, not a spinner.
- The disclaimer states plainly that audio stays on the device and the
  notation is a monophonic draft.

### Task 2 — Runtime env config + telemetry
Implement `config/env.ts`, `telemetry/sentry.ts`, `telemetry/analytics.ts`,
`docker-entrypoint.sh` env.js generation, `public/env.js` dev fallback, and
`.env.example`.
**Done when:**
- With no env set, the app runs normally and neither Sentry nor Umami loads.
- With `SENTRY_DSN` set, Sentry initializes; with `UMAMI_WEBSITE_ID` +
  `UMAMI_URL` set, the Umami tag is injected.
- No DSN, website id, or URL literal appears in committed source or in the
  built bundle; all three come only from `window.__HUMVAULT_ENV__`.

### Task 3 — Microphone capture + permission states
Implement `audio/recorder.ts` and the `requesting-mic` / `recording` /
`mic-denied` / `no-mic` states, the 15 s cap, and mic-track release on stop.
**Done when:**
- Granting permission records audio and stops on tap or at 15 s.
- Denying permission renders the designed `mic-denied` state with a clear
  next step and a Try again action, never a raw error or dead end.
- No available device renders the designed `no-mic` state.
- After recording, the browser mic indicator turns off (track released).

### Task 4 — Decode, resample, and transcribe
Implement `audio/decode.ts` (mono, 22050 Hz) and `transcribe/basicPitch.ts`
(self-hosted model, note extraction, monophonic clean-up). Load the model in
the background after first paint.
**Done when:**
- A recorded monophonic hum yields an ordered, non-overlapping
  `NoteEvent[]`.
- While the model warms or transcription runs, the screen shows in-place
  progress (`Getting ready` / `Reading your hum`), never a white screen.
- A hum that produces no clear notes lands in the designed `empty-result`
  state; a decode/model failure lands in the designed `error` state.

### Task 5 — Draft notation render
Implement `notation/notesToAbc.ts` and `components/NotationView.tsx`
(renders the ABC with `abcjs`).
**Done when:**
- `notesToAbc` is pure and deterministic: a fixed `NoteEvent[]` fixture
  always produces the same ABC string.
- The Capture screen shows rendered draft notation within a few seconds of
  the user finishing a simple monophonic hum.

### Task 6 — Playback
Implement `playback/player.ts` and wire the Play button, with the
self-hosted soundfont.
**Done when:**
- Tapping Play plays the drafted melody back through the browser, giving a
  pressed/active state within ~100 ms of the tap.
- A synth/audio failure shows the designed playback error with retry, not a
  dead button.
- `Record another` returns cleanly to `idle` and the flow can repeat.

### Task 7 — "Try an example" (first-minute bridge, not a walkthrough)
Add a single secondary action, `Try an example`, that loads the bundled
`tests/fixtures/simple-hum.wav` through the same decode → transcribe →
notation → playback pipeline, so a visitor on a device with no working
microphone (or who has not yet granted permission) can still see real draft
notation and hear playback within the first minute.
**Done when:**
- Tapping `Try an example` produces real draft notation (a non-empty result)
  and playable audio through the identical pipeline.
- It is visibly secondary to the Record button (does not compete with the
  primary action).
- No tour, coach marks, checklist, or onboarding library is added. This is a
  one-tap example, nothing more.

### Task 8 — Deploy scaffold
Author `Dockerfile` (multi-stage node build → nginx serve), `nginx/nginx.conf`
(SPA + `/healthz`), `docker-compose.staging.yml`, `.dockerignore`, and
`scripts/check-staging.sh`.
**Done when:**
- `docker compose -f docker-compose.staging.yml up --build` serves the app
  and `curl http://localhost:<port>/healthz` returns HTTP 200.
- The container generates `env.js` from environment variables at start; the
  image contains no committed secrets.
- The compose healthcheck reports healthy.

### Task 9 — README for strangers
Write `README.md`: what Hum Vault is (two or three plain sentences), how to
run it (exact clone / dev / `docker compose` commands verified against the
actual compose file), and how to contribute (where code lives, how to run
tests). No factory internals, no pipeline jargon. Note that the app is
client-only and audio never leaves the device.
**Done when:** a stranger can understand, run, and test the app from the
README alone, and the run commands match the real files.

### Task 10 — Copy sweep
Sweep every user-visible string (`copy/strings.ts`, components, README,
`.env.example` comments) for em-dashes / en-dashes, banned LLM vocabulary,
and negative empty-state phrasing. Fix every hit.
**Done when:** the automated copy test (Task 11) passes and a manual read of
each screen sounds human.

### Task 11 — Tests
See the test plan below. All listed automated tests pass locally.

---

## Test plan (which test proves each criterion)

Automated, run in the foreground to completion.

1. **`notesToAbc.test.ts` (vitest, unit)** — feed a fixed `NoteEvent[]`
   (a few notes across an octave with a gap) and assert the exact ABC output
   string, plus unit-test `midiToAbcPitch` for representative MIDI values
   (e.g. 60 → `C`, 61 → `^C`, 72 → `c`, 48 → `C,`). *Proves the draft
   conversion is deterministic and correct — the note fidelity the
   differentiator depends on.*

2. **`env.test.ts` (vitest, unit)** — stub `window.__HUMVAULT_ENV__` and
   assert `config/env.ts` returns values when present and safe defaults when
   absent, never throwing. *Proves env-only config.*

3. **`telemetry.test.ts` (vitest, unit)** — assert Sentry init is called
   only when `SENTRY_DSN` is set, and the Umami tag is injected only when
   both Umami vars are set; assert nothing loads when all are empty. *Proves
   telemetry loads from env only and degrades cleanly.*

4. **`captureScreen.test.tsx` (vitest + Testing Library, component)** — mock
   `getUserMedia`, the recorder, and the transcribe module. Assert:
   - first render shows heading, tagline, disclaimer, and the Record button
     (real content, not a spinner);
   - `NotAllowedError` from `getUserMedia` renders the `mic-denied` state
     with its next-step copy and Try again action;
   - the model-warming / transcribing states render in-place progress, not a
     blank screen;
   - a mocked non-empty note result renders notation and a Play control;
   - a mocked empty note result renders the `empty-result` state.
   *Proves the designed states, the mic-denial path, and no-white-screen.*

5. **`copy.test.ts` (vitest, unit)** — scan the exported strings in
   `copy/strings.ts` (and, if feasible, the README) for the characters `—`
   and `–`, the banned vocabulary list, and negative empty-state patterns
   (`You don't have`, `No … yet`, `Nothing … here`, `Unable to`,
   `Something went wrong`). Fail on any hit. *Proves the copy sweep, and
   keeps it passing as strings change.*

6. **`e2e/capture.spec.ts` (Playwright, Chromium)** — launch Chromium with
   fake media (`--use-fake-ui-for-media-stream`,
   `--use-fake-device-for-media-stream`,
   `--use-file-for-fake-audio-capture=<abs path to tests/fixtures/simple-hum.wav>`).
   Load the app, assert heading/disclaimer/Record button are present on load,
   record for a couple of seconds, stop, and assert draft notation (abcjs
   SVG) appears and a Play control is enabled. This is the strongest proof of
   the "hum → draft notation → playback within a few seconds, at 390px, no
   upload, no horizontal scroll" criterion; set the viewport to 390px wide
   and assert `document.scrollingElement.scrollWidth <=` the viewport width.
   *Proves the end-to-end first minute of value.* If the fake-audio capture
   proves flaky in the target CI, the implementer may drive the same pipeline
   through the `Try an example` fixture path instead, and must say so in the
   result summary rather than dropping the end-to-end proof.

7. **Staging check — `scripts/check-staging.sh` (foreground shell)** —
   `docker compose -f docker-compose.staging.yml up --build -d`, wait for
   healthy, `curl -f http://localhost:<port>/healthz` and assert 200, then
   grep the served bundle to assert no secret literal is present and that
   `/env.js` is generated from the container environment. Tear the stack down
   at the end. *Proves the deploy scaffold and the shipping-blocker
   `/healthz`.*

Map back to the planner's acceptance criteria:
- Dockerfile + compose + `/healthz` 200 → Test 7.
- 390px hum → notation → playback, no account/upload/scroll → Test 6.
- Mic-denial designed state → Tests 4 (component) and 5 (copy).
- First render fast, in-place progress, never white → Tests 4 and 6.
- Monophonic-draft + on-device disclaimer present → Test 4.
- `SENTRY_DSN` + Umami from env only, no secrets in bundle/git → Tests 2, 3,
  and 7.
- Copy sweep passes → Test 5.

---

## Definition of done for this EPIC
Every task above is complete, every listed automated test passes in the
foreground, the staging stack comes up with `/healthz` returning 200, the
copy sweep is clean, and the README lets a stranger run the app. No
persistence, search, import, export, or walkthrough has been added.
