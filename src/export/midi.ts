import type { NoteEvent } from "../transcribe/types";

// Deterministic NoteEvent[] -> Standard MIDI File (format 0, single track).
// Pure: the same notes always yield the same bytes. 120 BPM tempo meta event,
// fixed PPQ, one note-on/note-off pair per note.

export const MIDI_PPQ = 480;
// At 120 BPM a quarter note is 0.5 s, so one second is PPQ / 0.5 ticks.
const TICKS_PER_SEC = MIDI_PPQ * 2;
const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;
const ON_VELOCITY = 0x60;
const OFF_VELOCITY = 0x40;

function clampPitch(midi: number): number {
  return Math.min(127, Math.max(0, Math.round(midi)));
}

// Variable-length quantity encoding for delta times.
function vlq(value: number): number[] {
  let v = Math.max(0, Math.floor(value));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

export function notesToMidi(notes: NoteEvent[]): Uint8Array {
  const events: Array<{ tick: number; on: boolean; pitch: number }> = [];
  for (const note of notes) {
    const start = Math.max(0, Math.round(note.startSec * TICKS_PER_SEC));
    const end = Math.max(
      start + 1,
      Math.round((note.startSec + note.durationSec) * TICKS_PER_SEC),
    );
    const pitch = clampPitch(note.pitchMidi);
    events.push({ tick: start, on: true, pitch });
    events.push({ tick: end, on: false, pitch });
  }
  // Chronological order; at a shared tick the note-off comes first so back to
  // back notes never overlap.
  events.sort((a, b) => a.tick - b.tick || Number(a.on) - Number(b.on));

  const track: number[] = [];
  // Tempo meta event at delta 0: 500000 us per quarter = 120 BPM.
  track.push(0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20);
  let prevTick = 0;
  for (const event of events) {
    track.push(...vlq(event.tick - prevTick));
    prevTick = event.tick;
    track.push(
      event.on ? NOTE_ON : NOTE_OFF,
      event.pitch,
      event.on ? ON_VELOCITY : OFF_VELOCITY,
    );
  }
  // End of track.
  track.push(0x00, 0xff, 0x2f, 0x00);

  const header = [
    0x4d, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // header length 6
    0x00, 0x00, // format 0
    0x00, 0x01, // one track
    (MIDI_PPQ >> 8) & 0xff, MIDI_PPQ & 0xff,
  ];
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b, // "MTrk"
    (track.length >>> 24) & 0xff,
    (track.length >>> 16) & 0xff,
    (track.length >>> 8) & 0xff,
    track.length & 0xff,
  ];
  return Uint8Array.from([...header, ...trackHeader, ...track]);
}
