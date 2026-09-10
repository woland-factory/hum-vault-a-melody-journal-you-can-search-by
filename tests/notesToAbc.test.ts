import { describe, it, expect } from "vitest";
import { notesToAbc, midiToAbcPitch } from "../src/notation/notesToAbc";
import type { NoteEvent } from "../src/transcribe/types";

describe("midiToAbcPitch", () => {
  it("maps representative MIDI values using sharps and octave marks", () => {
    expect(midiToAbcPitch(60)).toBe("C"); // middle C
    expect(midiToAbcPitch(61)).toBe("^C"); // C sharp
    expect(midiToAbcPitch(72)).toBe("c"); // one octave up
    expect(midiToAbcPitch(48)).toBe("C,"); // one octave down
    expect(midiToAbcPitch(59)).toBe("B,"); // B below middle C
    expect(midiToAbcPitch(84)).toBe("c'"); // two octaves up
    expect(midiToAbcPitch(70)).toBe("^A"); // A sharp below c
  });
});

describe("notesToAbc", () => {
  it("is deterministic and produces the expected draft for a fixed fixture", () => {
    const notes: NoteEvent[] = [
      { pitchMidi: 60, startSec: 0.0, durationSec: 0.5 },
      { pitchMidi: 64, startSec: 0.5, durationSec: 0.25 },
      { pitchMidi: 67, startSec: 1.0, durationSec: 0.25 },
      { pitchMidi: 72, startSec: 1.5, durationSec: 0.5 },
    ];

    const expected =
      ["X:1", "M:4/4", "L:1/16", "Q:1/4=120", "K:C", "C4 E2 z2 G2 z2 c4 |"].join(
        "\n",
      ) + "\n";

    expect(notesToAbc(notes)).toBe(expected);
    // Determinism: same input, same output.
    expect(notesToAbc(notes)).toBe(notesToAbc([...notes]));
  });

  it("sorts unordered input and never emits a zero-length note", () => {
    const notes: NoteEvent[] = [
      { pitchMidi: 62, startSec: 0.5, durationSec: 0.02 },
      { pitchMidi: 60, startSec: 0.0, durationSec: 0.5 },
    ];
    const abc = notesToAbc(notes);
    // First pitch emitted is the earlier note (C), quantized to 4 sixteenths.
    expect(abc).toContain("C4");
    // The tiny 20ms note quantizes up to the 1-sixteenth minimum (D, no count).
    expect(abc.trimEnd().endsWith("D")).toBe(true);
  });
});
