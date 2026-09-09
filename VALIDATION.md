# VALIDATION — Hum Vault

## Verdict: VIABLE

Build it. The idea clears every gate this validation exists to apply, and its
risk profile is exactly what an outlier-hunting portfolio should carry: a
solid floor (already better than every free alternative even if the signature
feature underperforms) and a high ceiling (a genuinely new capability nobody
ships). The skeptic's premortem put kill probability at 0.85; I disagree with
that number because it prices the ceiling as if it were the floor. The
analysis below explains where the skeptic is right and why the verdict is
still viable.

## Core value proposition

A free, no-login, in-browser melody journal: hum a tune and it becomes
playable, editable draft notation on the spot with audio never leaving the
device; every idea joins a private, exportable songbook; and when you can
only remember a fragment of an idea from months ago, you hum that fragment
and the app finds the entry. The signature capability, melody search over
your own recordings, is shipped by no product at any price.

## Why it passes the value tests

- **"Couldn't a chatbot or a free tool do it?"** No. The core loop is
  acoustic (live microphone pitch capture), visual (rendered, playable
  notation as the primary surface), and stateful (a melody-indexed corpus
  accumulated across months). A chatbot does none of these; the free tools
  each do exactly one leg. Basic Pitch converts and forgets. The phone's
  voice-memo app remembers and cannot listen. The product lives in the seam:
  memory searchable by sound.
- **Durable artifact.** The songbook is a textbook compounding artifact:
  original audio plus transcription per entry, timestamped, playable,
  exportable as a zip of audio + MIDI/MusicXML that any DAW or notation
  program accepts. Every entry makes the next search more likely to hit.
- **Real demand signal.** A 93-point HN thread on a cruder demo of half of
  this product, with users explicitly asking for it to exist and naming the
  exact defect (rhythm accuracy) a modern on-device model addresses.
- **Ambition bar.** The signature moment is a mechanic, not an adjective:
  "I hummed three notes and it played back the idea I recorded in March."
  It passes the obvious-answer test; the obvious answer here is yet another
  one-shot converter, and that is precisely what this is not.

## Buildability check (verified, not assumed)

- `@spotify/basic-pitch` 1.0.1 is live on npm today: the official
  TensorFlow.js port, Apache-2.0, runs fully in-browser. Verified during
  this validation.
- Notation: `abcjs` 6.7.0 or `vexflow` 5.0.0, both live, both mature.
- Search: interval-contour + dynamic-time-warping over tens to low
  thousands of entries is plain JavaScript brute force; no server, no
  vector database.
- Storage: IndexedDB + file export/import. Static hosting; the staging
  deploy scaffold is a trivial nginx-style container. Running cost ~zero.
- No runtime LLM anywhere in the core loop, so no BYOK surface and no
  gateway request. The first moment of value has zero key-pasting friction.

This is the rare idea where "audio never leaves the device" is the cheapest
architecture rather than a constraint.

## Minimal feature set (the smallest product that delivers the value)

1. **Capture and transcribe.** Record a hum in the browser; on-device Basic
   Pitch transcription; monophonic only, stated plainly in the UI.
2. **Draft notation with playback.** Rendered notation presented as an
   editable draft (fix a wrong note, retitle), never as engraving. Playback
   of both the transcription and the original audio.
3. **The songbook.** Every entry persisted locally (audio + MIDI +
   metadata), listed, playable, deletable.
4. **Hum-to-search.** Hum a fragment, get ranked matches from your own
   corpus with instant playback. Contour-based matching (relative
   intervals), which tolerates the systematic pitch errors that appear on
   both sides of a same-voice comparison.
5. **Bulk import.** Drag in a folder of existing voice memos; batch
   transcribe and index on-device. This is the cold-start solution, not a
   nice-to-have: it makes the signature search useful on day one for
   exactly the person with the documented pain.
6. **Full export and re-import.** One-click zip backup of the whole vault,
   plus restore. Ships in v1 because the vault lives in evictable browser
   storage; also request `navigator.storage.persist()`.
7. **Seeded first run.** A bundled demo entry or two so a stranger on
   staging sees transcription and a successful hum-search inside the first
   minute without hand-crafted input.

## Main risks (each named with its mitigation, none hidden)

1. **Transcription accuracy on untrained humming.** The documented pain of
   the entire category (~52% note-level F-measure on vocals for Basic
   Pitch). Mitigation is framing and depth allocation: notation is an
   editable draft, and the engineering depth goes into the melodic index,
   where same-voice symmetry and contour matching cancel much of the error.
   Rhythm quantization of free-time humming should be scoped conservatively.
2. **Short queries are information-poor.** A literal 3-note query is two
   intervals and will match many entries. The plan must design for this:
   encourage 6–10 note fragments in the search UI, rank rather than
   filter, and make the result list instantly auditable by ear (tap, hear,
   move on). The signature claim survives as "hum the bit you remember,"
   not "three notes guaranteed."
3. **The corpus cold-start / capture-habit gap.** The skeptic's strongest
   objection: tunes strike when the phone's lock-screen recorder is two
   seconds away and a browser tab is not. Real, and it is why bulk import
   is in the minimal set: the target user already HAS the corpus, as a
   voice-memo graveyard. Import turns years of backlog into a searchable
   archive on day one; the forward-capture habit is upside, not the
   foundation. An installable PWA improves capture ergonomics but is not
   load-bearing for v1.
4. **Data eviction.** Browser storage can be cleared silently. Mitigation
   ships in v1 (export/import, persistent-storage request, a visible
   backup nudge once the vault has meaningful content). An evictable vault
   without backup would betray the product's one promise, so this is
   non-negotiable scope.
5. **iOS Safari microphone capture.** The memo-graveyard user is on a
   phone. `getUserMedia` works in modern iOS Safari but has sharp edges
   (sample rates, user-gesture requirements, backgrounding). The plan must
   front-load a mobile capture spike in EPIC 1, not discover problems in
   the polish pass.

## Where I push back on the skeptic

- "The missing combination looks like absent demand": Dubnote and Hum are
  small indie apps, not evidence that melody search was tried and failed;
  Google and SoundHound ship query-by-humming at scale, proving the
  interaction works, and simply point it at the only corpus they monetize.
  Absence here reads as positioning, not falsification.
- "One-session wonder": the floor case (free, uncapped hum-to-notation
  with a persistent library and export) already beats ScoreCloud Express
  (10-song cap, subscription), Sing2Notes (20-second demo, cloud), and
  Basic Pitch's own demo (no library, no notation). A product whose
  degraded mode still wins its category is a safe build even before the
  signature lands.

## What would make me reject it (kill criteria for the build)

- If in-browser Basic Pitch cannot transcribe a typical 8-second hum in
  acceptable time on a mid-range phone (target: well under the length of
  the clip itself), the on-device promise collapses and with it the
  privacy/price position. Test this in EPIC 1.
- If contour matching cannot put the right entry in the top 3 for a
  re-hummed 8-note fragment against a 50-entry corpus in internal testing,
  the signature is a party trick; the product would need to be re-judged
  as a plain converter, which is not what was validated here.
- If iOS Safari capture proves unworkable, the primary user is locked out
  and the idea should return to the owner before further build spend.

None of these is knowable to be true today, all three are cheaply testable
in the first EPIC, and that is exactly where a viable-but-risky idea
belongs: in a build that tests its own kill criteria early.
