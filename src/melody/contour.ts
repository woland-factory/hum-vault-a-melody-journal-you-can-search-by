import type { NoteEvent } from "../transcribe/types";
import { CONTOUR_VERSION, type MelodyContour } from "../db/schema";

// Guards divide-by-zero when two notes share an onset time.
const EPSILON = 1e-4;

/**
 * Derive the melody search index from an entry's notes. Pure and
 * deterministic: the same notes always yield the same contour. EPIC 3 relies
 * on that determinism when it matches a hummed fragment against a stored
 * entry's contour.
 *
 * - intervals: consecutive integer semitone deltas. The same melodic shape
 *   hummed in any key or octave yields identical intervals.
 * - ioiRatios: consecutive inter-onset-interval ratios. The same rhythm hummed
 *   faster or slower yields the same ratios.
 *
 * Raw arrays are kept here without bucketing or quantization. EPIC 3 owns any
 * coarsening it needs at match time and may raise CONTOUR_VERSION if it changes
 * the representation.
 */
export function computeContour(notes: NoteEvent[]): MelodyContour {
  const ordered = [...notes].sort((a, b) => a.startSec - b.startSec);

  const intervals: number[] = [];
  for (let i = 0; i + 1 < ordered.length; i++) {
    intervals.push(Math.round(ordered[i + 1].pitchMidi) - Math.round(ordered[i].pitchMidi));
  }

  const ioi: number[] = [];
  for (let i = 0; i + 1 < ordered.length; i++) {
    ioi.push(ordered[i + 1].startSec - ordered[i].startSec);
  }

  const ioiRatios: number[] = [];
  for (let i = 0; i + 1 < ioi.length; i++) {
    ioiRatios.push(ioi[i + 1] / Math.max(ioi[i], EPSILON));
  }

  return {
    version: CONTOUR_VERSION,
    noteCount: ordered.length,
    intervals,
    ioiRatios,
  };
}
