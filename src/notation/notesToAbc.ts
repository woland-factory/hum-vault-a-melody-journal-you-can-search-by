import type { NoteEvent } from "../transcribe/types";

// Draft notation on a fixed grid. This is deliberately a rough draft, not
// engraving: no tempo or key detection. The same NoteEvent[] always yields the
// same ABC string, which is what the unit test pins.

// From Q:1/4=120, a quarter note is 0.5 s, so one sixteenth (L:1/16) is 0.125 s.
const GRID_SEC = 0.125;
const SIXTEENTHS_PER_BAR = 16; // M:4/4

const HEADER = ["X:1", "M:4/4", "L:1/16", "Q:1/4=120", "K:C"];

// Chromatic names using sharps. Index is pitch class 0..11 starting at C.
const PITCH_CLASS = [
  "C",
  "^C",
  "D",
  "^D",
  "E",
  "F",
  "^F",
  "G",
  "^G",
  "A",
  "^A",
  "B",
];

/**
 * Map a MIDI note number to an ABC pitch token using sharps.
 * Middle C (60) is `C`; 72 is `c`; below C4 add commas; above C5 add
 * apostrophes; sharps use the `^` prefix.
 */
export function midiToAbcPitch(midi: number): string {
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  const token = PITCH_CLASS[pc];
  const accidental = token.startsWith("^") ? "^" : "";
  let letter = token.slice(accidental.length);

  let marks = "";
  if (octave >= 5) {
    letter = letter.toLowerCase();
    marks = "'".repeat(octave - 5);
  } else if (octave < 4) {
    marks = ",".repeat(4 - octave);
  }
  return accidental + letter + marks;
}

function toSixteenths(seconds: number): number {
  return Math.max(1, Math.round(seconds / GRID_SEC));
}

// Under L:1/16 a length of 1 is implied, so only write the count when > 1.
function lengthSuffix(sixteenths: number): string {
  return sixteenths > 1 ? String(sixteenths) : "";
}

/**
 * Convert cleaned, monophonic NoteEvent[] into a draft ABC notation string.
 * Pure and deterministic.
 */
export function notesToAbc(notes: NoteEvent[]): string {
  const ordered = [...notes].sort((a, b) => a.startSec - b.startSec);
  const tokens: string[] = [];
  let beatsInBar = 0;

  const push = (token: string, sixteenths: number) => {
    tokens.push(token);
    beatsInBar += sixteenths;
    if (beatsInBar >= SIXTEENTHS_PER_BAR) {
      beatsInBar -= SIXTEENTHS_PER_BAR;
      tokens.push("|");
    }
  };

  let prevEnd: number | null = null;
  for (const note of ordered) {
    if (prevEnd !== null) {
      const gap = note.startSec - prevEnd;
      if (gap >= GRID_SEC / 2) {
        const restLen = toSixteenths(gap);
        push("z" + lengthSuffix(restLen), restLen);
      }
    }
    const len = toSixteenths(note.durationSec);
    push(midiToAbcPitch(note.pitchMidi) + lengthSuffix(len), len);
    prevEnd = note.startSec + note.durationSec;
  }

  const body = tokens.join(" ").trim();
  return [...HEADER, body].join("\n") + "\n";
}
