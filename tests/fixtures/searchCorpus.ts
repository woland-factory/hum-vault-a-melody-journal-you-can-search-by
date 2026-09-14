import type { NoteEvent } from "../../src/transcribe/types";
import type { MelodyContour, SearchCandidate } from "../../src/db/schema";
import { computeContour } from "../../src/melody/contour";

// The documented ranking fixture. The top-3 acceptance criterion is proven
// against this, deterministically, with no audio: the matcher is a pure
// function over contours. Corpus contours are produced by the REAL pipeline
// (computeContour), not hand-typed, so the fixture exercises the same
// transformation a saved entry goes through.

// Build a NoteEvent[] from a pitch sequence and a constant note length. One
// eighth note per pitch by default; melodies with a distinct rhythm can pass
// per-note lengths.
function melody(
  pitches: number[],
  step = 0.5,
  lengths?: number[],
): NoteEvent[] {
  const notes: NoteEvent[] = [];
  let t = 0;
  for (let i = 0; i < pitches.length; i++) {
    const dur = lengths ? lengths[i] : step;
    notes.push({ pitchMidi: pitches[i], startSec: t, durationSec: dur });
    t += dur;
  }
  return notes;
}

// Six plainly different shapes so a genuine fragment of one cannot be confused
// with another. C4 = 60.
export const CORPUS_MELODIES: Record<string, NoteEvent[]> = {
  // A rising major run.
  risingRun: melody([60, 62, 64, 65, 67, 69, 71, 72]),
  // A descending line.
  descending: melody([79, 77, 76, 74, 72, 71, 69, 67]),
  // A broken major arpeggio up and down.
  arpeggio: melody([60, 64, 67, 72, 67, 64, 60, 64, 67, 72]),
  // A repeated-note motif that then leaps.
  repeatedMotif: melody([62, 62, 62, 69, 69, 67, 65, 64]),
  // A wide zig-zag.
  zigzag: melody([60, 67, 61, 68, 62, 69, 63, 70]),
  // A gentle wave around a center.
  wave: melody([65, 67, 65, 63, 65, 67, 69, 67, 65, 63]),
};

export function buildCorpus(): SearchCandidate[] {
  return Object.entries(CORPUS_MELODIES).map(([id, notes]) => ({
    id,
    title: id,
    contour: computeContour(notes),
  }));
}

// Slice a fragment out of an entry's notes and turn it into a query contour,
// simulating a half-remembered hum: transpose (a different octave/starting
// pitch), tempoScale (faster or slower), and optionally perturb one note's
// pitch by +/-1 semitone (an imperfect hum). Returns a MelodyContour via the
// real computeContour, so the query is transformed exactly like a saved entry.
export function fragmentOf(
  entryNotes: NoteEvent[],
  start: number,
  length: number,
  opts: { transpose?: number; tempoScale?: number; perturbAt?: number } = {},
): MelodyContour {
  const transpose = opts.transpose ?? 0;
  const tempoScale = opts.tempoScale ?? 1;
  const slice = entryNotes.slice(start, start + length).map((n) => ({
    pitchMidi: n.pitchMidi + transpose,
    startSec: n.startSec * tempoScale,
    durationSec: n.durationSec * tempoScale,
  }));
  if (opts.perturbAt !== undefined && opts.perturbAt < slice.length) {
    slice[opts.perturbAt] = {
      ...slice[opts.perturbAt],
      pitchMidi: slice[opts.perturbAt].pitchMidi + 1,
    };
  }
  return computeContour(slice);
}

// A made-up melody unrelated to any corpus shape, for the no-match case. Every
// step is a full-octave leap, larger in magnitude than any interval in the
// corpus, so no contiguous slice of any entry aligns cheaply.
export function unrelatedQuery(): MelodyContour {
  return computeContour(melody([60, 72, 60, 72, 60, 72]));
}
