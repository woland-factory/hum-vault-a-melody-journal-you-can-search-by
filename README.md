# Hum Vault

Hum a tune into your browser and watch it turn into draft sheet music you can
play back. Everything runs on your device: the microphone audio is transcribed
locally and never uploaded. Save each hum to a private songbook that grows into
a collection of your melodic ideas, then find any old idea by humming the few
notes you still remember.

## How it works

1. Tap **Record a hum** and sing or hum one melody line.
2. Recording stops when you tap **Stop** or after 15 seconds.
3. The hum is transcribed on-device with
   [`@spotify/basic-pitch`](https://github.com/spotify/basic-pitch) and drawn as
   draft [ABC notation](https://abcnotation.com/) with
   [`abcjs`](https://www.abcjs.net/).
4. Tap **Play** to hear the draft back.
5. Tap **Save to songbook** to keep it. Saved ideas live in your browser's
   IndexedDB, so they survive a reload and a browser restart.

No microphone handy? Tap **Try an example** to run the same pipeline on a
bundled sample.

The notation is a rough draft of a single melody line, not engraving-grade
score. Getting the notes right is the point; the rhythm of the draft stays
rough on purpose.

### Your songbook

Open the **Songbook** to see every saved idea, newest first. Play any entry
from the list, or open one to rename it, add and remove tags, edit its draft
notation, or delete it. The list loads a page at a time so it stays fast as the
collection grows.

Each saved entry also stores a **contour**: the melody's shape as a list of
note-to-note intervals and rhythm ratios. Intervals make the shape independent
of key and octave, and ratios make it independent of tempo. That contour is the
index search matches a hummed fragment against.

The contour is derived from the transcribed notes, not from the draft notation.
Editing an entry's notation by hand changes only how it looks and plays back. It
does not change the notes or the contour, so hand edits never skew the search
index.

### Find a tune by humming

From a songbook with saved ideas, tap **Hum to search** and hum the part of an
old tune you still remember. Hum Vault transcribes the fragment on-device,
computes its contour, and ranks your saved ideas by melodic distance, closest
first. The match works on melodic shape, so it finds the idea even when you hum
in a different key or octave, faster or slower, or miss a note. Play any result
in place or open its full entry.

The search runs entirely in the browser over your own saved ideas. There is no
server and no music catalog: it only ever finds tunes you have saved, and the
query hum is matched in memory and never saved.

## Run it locally

Requires [Node.js](https://nodejs.org/) 22+.

```bash
git clone <this-repo-url>
cd hum-vault-a-melody-journal-you-can-search-by
npm install
npm run dev
```

Open the printed URL (http://localhost:5173). Microphone access needs a secure
context, which `localhost` provides.

Configuration is optional. Copy `.env.example` to `.env` to wire error tracking
and analytics. With nothing set, the app runs fully.

## Run it with Docker

The production image builds the static bundle and serves it with nginx.

```bash
docker build -t hum-vault .
docker run --rm -p 8080:80 hum-vault
```

Open http://localhost:8080. The container writes `env.js` from the environment
at start, so configuration is injected at deploy time rather than baked into
the image:

```bash
docker run --rm -p 8080:80 \
  -e SENTRY_DSN="https://your-dsn" \
  -e UMAMI_WEBSITE_ID="your-id" \
  -e UMAMI_URL="https://your-umami/script.js" \
  hum-vault
```

`docker-compose.staging.yml` is the deploy manifest used to host the app behind
a shared reverse proxy. `scripts/check-staging.sh` builds the image and verifies
it serves, generates `env.js`, and keeps runtime values out of the bundle.

## Project layout

```
src/
  components/   Capture, songbook, search, entry detail, and shared UI surfaces
  audio/        Microphone capture, decode and resample to mono 22050 Hz
  transcribe/   basic-pitch model loading and monophonic note extraction
  notation/     Deterministic NoteEvent[] -> draft ABC, and ABC -> playable tune
  melody/       Pure contour (search index), the melodic matcher, and helpers
  db/           IndexedDB schema and the typed Entry CRUD layer
  router/       Tiny hash router for the capture, songbook, search, and entry views
  playback/     abcjs synth wrapper, self-hosted soundfont, shared player
  util/         Small helpers (date formatting)
  config/       Runtime env read from window.__HUMVAULT_ENV__
  telemetry/    Optional Sentry and Umami wiring
  copy/         Every user-visible string in one place
public/
  model/        Self-hosted basic-pitch model and weights
  soundfont/    Self-hosted piano soundfont for playback
tests/          Unit, component, and end-to-end tests
```

## Tests

```bash
npm test          # unit and component tests (vitest)
bash scripts/e2e.sh   # end-to-end test in the pinned Playwright container
```

`scripts/e2e.sh` runs the suite inside the official Playwright image so the
browser build matches the pinned `@playwright/test` version. The end-to-end
tests build the production bundle and drive the app in a real browser, including
a save-then-reload proof that a saved entry persists in IndexedDB.

Storage isolation: unit tests run against
[`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB) under jsdom, and
each Playwright test gets a fresh browser context with its own empty IndexedDB.
Every run starts from a clean database with no shared state to leak between runs.

## A note on privacy and security

Hum Vault is client-only. There is no account and no server: the recording is
processed in the browser and never leaves the device. Saved ideas, including the
original audio, live in the browser's own IndexedDB on your device. Because
there is no server-side state or API, there are no authenticated routes to
guard in this release. Input is still validated at the storage boundary, and the
app handles a full storage quota with a clear retry rather than a crash.

## License

MIT. See [LICENSE](./LICENSE).
