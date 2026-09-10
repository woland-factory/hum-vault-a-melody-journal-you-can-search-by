# Hum Vault

Hum a tune into your browser and watch it turn into draft sheet music you can
play back. Everything runs on your device: the microphone audio is transcribed
locally and never uploaded. This first release is the capture screen, the start
of a private songbook you will later be able to search by humming.

## How it works

1. Tap **Record a hum** and sing or hum one melody line.
2. Recording stops when you tap **Stop** or after 15 seconds.
3. The hum is transcribed on-device with
   [`@spotify/basic-pitch`](https://github.com/spotify/basic-pitch) and drawn as
   draft [ABC notation](https://abcnotation.com/) with
   [`abcjs`](https://www.abcjs.net/).
4. Tap **Play** to hear the draft back.

No microphone handy? Tap **Try an example** to run the same pipeline on a
bundled sample.

The notation is a rough draft of a single melody line, not engraving-grade
score. Getting the notes right is the point; the rhythm of the draft stays
rough on purpose.

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
  components/   Capture screen, record button, notation view, status surfaces
  audio/        Microphone capture, decode and resample to mono 22050 Hz
  transcribe/   basic-pitch model loading and monophonic note extraction
  notation/     Deterministic NoteEvent[] -> draft ABC conversion
  playback/     abcjs synth wrapper, self-hosted soundfont
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
test builds the production bundle and drives the capture pipeline in a real
browser.

## A note on privacy and security

Hum Vault is client-only. There is no account, no server, and no database: the
recording is processed in the browser and never leaves the device. Because
there is no server-side state or API, there are no authenticated routes to
guard in this release.

## License

MIT. See [LICENSE](./LICENSE).
