import type { NoteEvent } from "../transcribe/types";

// Deterministic NoteEvent[] -> MusicXML. Pure: the same notes always yield the
// same string. Quantized on the same 1/16 grid and 120 BPM / 4-4 assumptions
// notesToAbc uses, with rests for gaps, so the score matches the draft ABC.

const GRID_SEC = 0.125; // one sixteenth at Q:1/4=120
const DIVISIONS = 4; // divisions per quarter note; a sixteenth = 1 division
const SIXTEENTHS_PER_BAR = 16; // 4/4

// Chromatic spelling with sharps, matching midiToAbcPitch.
const STEP_FOR_PC: ReadonlyArray<{ step: string; alter: number }> = [
  { step: "C", alter: 0 },
  { step: "C", alter: 1 },
  { step: "D", alter: 0 },
  { step: "D", alter: 1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "F", alter: 1 },
  { step: "G", alter: 0 },
  { step: "G", alter: 1 },
  { step: "A", alter: 0 },
  { step: "A", alter: 1 },
  { step: "B", alter: 0 },
];

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toSixteenths(seconds: number): number {
  return Math.max(1, Math.round(seconds / GRID_SEC));
}

function pitchXml(midi: number): string {
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1; // MIDI 60 -> C4
  const { step, alter } = STEP_FOR_PC[pc];
  const alterXml = alter !== 0 ? `<alter>${alter}</alter>` : "";
  return `<pitch><step>${step}</step>${alterXml}<octave>${octave}</octave></pitch>`;
}

const ATTRIBUTES =
  `<attributes><divisions>${DIVISIONS}</divisions>` +
  `<key><fifths>0</fifths></key>` +
  `<time><beats>4</beats><beat-type>4</beat-type></time>` +
  `<clef><sign>G</sign><line>2</line></clef></attributes>`;

/**
 * Emit a minimal valid MusicXML 3.x score-partwise document for a single-voice
 * melody. One <note> with a <pitch> per transcribed note, rests for gaps,
 * measures filled greedily on the 4/4 sixteenth grid.
 */
export function notesToMusicXml(
  notes: NoteEvent[],
  meta: { title: string },
): string {
  const ordered = [...notes].sort((a, b) => a.startSec - b.startSec);

  // Token stream on the shared grid: pitched notes plus rests for gaps.
  const tokens: Array<{ pitch?: number; sixteenths: number }> = [];
  let prevEnd: number | null = null;
  for (const note of ordered) {
    if (prevEnd !== null) {
      const gap = note.startSec - prevEnd;
      if (gap >= GRID_SEC / 2) tokens.push({ sixteenths: toSixteenths(gap) });
    }
    tokens.push({ pitch: note.pitchMidi, sixteenths: toSixteenths(note.durationSec) });
    prevEnd = note.startSec + note.durationSec;
  }

  // Fill measures greedily: start a new measure once a bar's worth of
  // sixteenths has accumulated. A token never splits, so the note count in the
  // document equals the note count in the input.
  const measures: string[][] = [[]];
  let fill = 0;
  for (const token of tokens) {
    const body =
      token.pitch !== undefined
        ? `<note>${pitchXml(token.pitch)}<duration>${token.sixteenths}</duration><voice>1</voice></note>`
        : `<note><rest/><duration>${token.sixteenths}</duration><voice>1</voice></note>`;
    measures[measures.length - 1].push(body);
    fill += token.sixteenths;
    if (fill >= SIXTEENTHS_PER_BAR) {
      fill -= SIXTEENTHS_PER_BAR;
      measures.push([]);
    }
  }
  if (measures.length > 1 && measures[measures.length - 1].length === 0) {
    measures.pop();
  }

  const measureXml = measures
    .map((content, i) => {
      const head = i === 0 ? `${ATTRIBUTES}<sound tempo="120"/>` : "";
      return `<measure number="${i + 1}">${head}${content.join("")}</measure>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<score-partwise version="3.1">` +
    `<work><work-title>${escapeXml(meta.title)}</work-title></work>` +
    `<part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>` +
    `<part id="P1">${measureXml}</part>` +
    `</score-partwise>`
  );
}
