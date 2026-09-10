// One transcribed note. This is the forward-compatible shape later EPICs store
// as a melody contour and match against when searching by ear.
export interface NoteEvent {
  /** MIDI note number, e.g. 60 for middle C. */
  pitchMidi: number;
  /** Onset time in seconds from the start of the recording. */
  startSec: number;
  /** Duration in seconds. Always positive. */
  durationSec: number;
}
