import { describe, it, expect } from "vitest";
import { computeContour } from "../src/melody/contour";
import { CONTOUR_VERSION } from "../src/db/schema";
import type { NoteEvent } from "../src/transcribe/types";

// A fixed three-note fixture: C, E, D with a clear rhythm.
const fixture: NoteEvent[] = [
  { pitchMidi: 60, startSec: 0.0, durationSec: 0.5 },
  { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
  { pitchMidi: 62, startSec: 1.5, durationSec: 0.5 },
];

describe("computeContour", () => {
  it("is deterministic for a fixed fixture", () => {
    const a = computeContour(fixture);
    const b = computeContour(fixture);
    expect(a).toEqual(b);
    expect(a).toEqual({
      version: CONTOUR_VERSION,
      noteCount: 3,
      intervals: [4, -2],
      // ioi = [0.5, 1.0]; ratios = [1.0 / 0.5] = [2]
      ioiRatios: [2],
    });
  });

  it("intervals are unchanged when the melody is transposed to any key or octave", () => {
    const base = computeContour(fixture);
    for (const shift of [-24, -12, -5, 7, 12, 25]) {
      const shifted = fixture.map((n) => ({ ...n, pitchMidi: n.pitchMidi + shift }));
      expect(computeContour(shifted).intervals).toEqual(base.intervals);
    }
  });

  it("ioiRatios are unchanged when every time value is scaled (tempo change)", () => {
    const base = computeContour(fixture);
    for (const factor of [0.5, 2, 3.7]) {
      const scaled = fixture.map((n) => ({
        ...n,
        startSec: n.startSec * factor,
        durationSec: n.durationSec * factor,
      }));
      const contour = computeContour(scaled);
      expect(contour.ioiRatios.length).toBe(base.ioiRatios.length);
      contour.ioiRatios.forEach((r, i) => expect(r).toBeCloseTo(base.ioiRatios[i], 10));
    }
  });

  it("sorts by onset before deriving (order-independent)", () => {
    const shuffled = [fixture[2], fixture[0], fixture[1]];
    expect(computeContour(shuffled)).toEqual(computeContour(fixture));
  });

  it("handles 0, 1, and 2 note inputs without throwing", () => {
    expect(computeContour([])).toEqual({
      version: CONTOUR_VERSION,
      noteCount: 0,
      intervals: [],
      ioiRatios: [],
    });

    const one = computeContour([{ pitchMidi: 67, startSec: 0, durationSec: 0.3 }]);
    expect(one.noteCount).toBe(1);
    expect(one.intervals).toEqual([]);
    expect(one.ioiRatios).toEqual([]);

    const two = computeContour([
      { pitchMidi: 60, startSec: 0, durationSec: 0.3 },
      { pitchMidi: 67, startSec: 0.4, durationSec: 0.3 },
    ]);
    expect(two.noteCount).toBe(2);
    expect(two.intervals).toEqual([7]);
    expect(two.ioiRatios).toEqual([]);
  });

  it("rounds fractional MIDI pitches before differencing", () => {
    const notes: NoteEvent[] = [
      { pitchMidi: 60.4, startSec: 0, durationSec: 0.3 },
      { pitchMidi: 63.6, startSec: 0.5, durationSec: 0.3 },
    ];
    expect(computeContour(notes).intervals).toEqual([4]);
  });

  it("does not divide by zero when two notes share an onset", () => {
    const notes: NoteEvent[] = [
      { pitchMidi: 60, startSec: 0, durationSec: 0.3 },
      { pitchMidi: 62, startSec: 0, durationSec: 0.3 },
      { pitchMidi: 64, startSec: 0.5, durationSec: 0.3 },
    ];
    const contour = computeContour(notes);
    expect(contour.ioiRatios.every((r) => Number.isFinite(r))).toBe(true);
  });
});
