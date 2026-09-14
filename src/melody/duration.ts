import type { NoteEvent } from "../transcribe/types";

// Rough playback length in milliseconds, used only to reset a "playing"
// indicator. The synth times playback from the ABC; this estimate just needs
// to be close enough that the button label returns to Play near the end.
export function estimateMelodyMs(notes: NoteEvent[]): number {
  const end = notes.reduce((max, n) => Math.max(max, n.startSec + n.durationSec), 0);
  return Math.round(end * 1000) + 800;
}
