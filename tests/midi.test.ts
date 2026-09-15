import { describe, it, expect } from "vitest";
import { notesToMidi } from "../src/export/midi";
import type { NoteEvent } from "../src/transcribe/types";

const NOTES: NoteEvent[] = [
  { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
  { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
  { pitchMidi: 67, startSec: 1.25, durationSec: 0.75 },
];

function ascii(bytes: Uint8Array, start: number, len: number): string {
  return String.fromCharCode(...bytes.slice(start, start + len));
}

// Minimal SMF track walker: counts note-on / note-off events and meta events.
function walkTrack(bytes: Uint8Array): { on: number; off: number; meta: number[] } {
  expect(ascii(bytes, 14, 4)).toBe("MTrk");
  const trackLen =
    (bytes[18] << 24) | (bytes[19] << 16) | (bytes[20] << 8) | bytes[21];
  let i = 22;
  const end = 22 + trackLen;
  const out = { on: 0, off: 0, meta: [] as number[] };
  while (i < end) {
    // Delta time (VLQ).
    while (bytes[i] & 0x80) i++;
    i++;
    const status = bytes[i];
    if (status === 0xff) {
      out.meta.push(bytes[i + 1]);
      const len = bytes[i + 2];
      i += 3 + len;
    } else if ((status & 0xf0) === 0x90) {
      out.on++;
      i += 3;
    } else if ((status & 0xf0) === 0x80) {
      out.off++;
      i += 3;
    } else {
      throw new Error(`unexpected status byte 0x${status.toString(16)} at ${i}`);
    }
  }
  expect(i).toBe(end);
  return out;
}

describe("notesToMidi", () => {
  it("starts with an MThd header for a format 0 file with one track", () => {
    const bytes = notesToMidi(NOTES);
    expect(ascii(bytes, 0, 4)).toBe("MThd");
    // length 6, format 0, ntrks 1
    expect(Array.from(bytes.slice(4, 12))).toEqual([0, 0, 0, 6, 0, 0, 0, 1]);
    expect(ascii(bytes, 14, 4)).toBe("MTrk");
  });

  it("contains a note-on/note-off pair per note, a tempo event, and an end of track", () => {
    const { on, off, meta } = walkTrack(notesToMidi(NOTES));
    expect(on).toBe(NOTES.length);
    expect(off).toBe(NOTES.length);
    expect(meta).toContain(0x51); // tempo
    expect(meta[meta.length - 1]).toBe(0x2f); // end of track last
  });

  it("is byte-stable across runs for identical input", () => {
    const a = notesToMidi(NOTES);
    const b = notesToMidi([...NOTES]);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("emits the exact expected bytes for a single known note", () => {
    // One note: C4 at t=0 for 0.5 s = 480 ticks at PPQ 480 / 120 BPM.
    const bytes = notesToMidi([{ pitchMidi: 60, startSec: 0, durationSec: 0.5 }]);
    expect(Array.from(bytes)).toEqual([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0, // MThd, PPQ 480
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 20, // MTrk, 20 bytes
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // tempo 500000
      0x00, 0x90, 0x3c, 0x60, // note on C4
      0x83, 0x60, 0x80, 0x3c, 0x40, // delta 480, note off
      0x00, 0xff, 0x2f, 0x00, // end of track
    ]);
  });

  it("handles an empty notes array as a valid empty track", () => {
    const bytes = notesToMidi([]);
    const { on, off, meta } = walkTrack(bytes);
    expect(on).toBe(0);
    expect(off).toBe(0);
    expect(meta).toEqual([0x51, 0x2f]);
  });

  it("clamps out-of-range pitches into the MIDI range", () => {
    const bytes = notesToMidi([
      { pitchMidi: 200, startSec: 0, durationSec: 0.5 },
      { pitchMidi: -5, startSec: 0.5, durationSec: 0.5 },
    ]);
    const { on, off } = walkTrack(bytes);
    expect(on).toBe(2);
    expect(off).toBe(2);
  });
});
