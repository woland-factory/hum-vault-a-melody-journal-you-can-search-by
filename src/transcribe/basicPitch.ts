import type { NoteEvent } from "./types";

// On-device transcription with @spotify/basic-pitch (TensorFlow.js). The model
// is loaded once, lazily, and kept warm. basic-pitch and TensorFlow.js are
// dynamically imported so they stay out of the first-paint bundle.

const MODEL_URL = "/model/model.json";
const MIN_NOTE_SEC = 0.06; // 60 ms floor: drop shorter notes as noise.

type BasicPitchModule = typeof import("@spotify/basic-pitch");

let modulePromise: Promise<BasicPitchModule> | null = null;
// `any` avoids importing the heavy type eagerly; the class shape is stable.
let instancePromise: Promise<any> | null = null;

async function getModule(): Promise<BasicPitchModule> {
  if (!modulePromise) modulePromise = import("@spotify/basic-pitch");
  return modulePromise;
}

/**
 * Begin loading the model. Safe to call repeatedly; the work happens once.
 * Call this right after first paint to warm the model in the background.
 */
export async function warmUpModel(): Promise<void> {
  await getInstance();
}

async function getInstance(): Promise<any> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const { BasicPitch } = await getModule();
      const basicPitch = new BasicPitch(MODEL_URL);
      // Resolve the underlying model so later calls are warm.
      await basicPitch.model;
      return basicPitch;
    })();
  }
  return instancePromise;
}

/**
 * Transcribe mono 22050 Hz audio into ordered, non-overlapping NoteEvents.
 * @param audio mono Float32Array at 22050 Hz
 * @param onProgress 0..1 inference progress
 */
export async function transcribe(
  audio: Float32Array,
  onProgress?: (fraction: number) => void,
): Promise<NoteEvent[]> {
  const mod = await getModule();
  const basicPitch = await getInstance();

  let frames: number[][] = [];
  let onsets: number[][] = [];
  let contours: number[][] = [];

  await basicPitch.evaluateModel(
    audio,
    (f: number[][], o: number[][], c: number[][]) => {
      frames = frames.concat(f);
      onsets = onsets.concat(o);
      contours = contours.concat(c);
    },
    (percent: number) => onProgress?.(percent),
  );

  const rawNotes = mod.addPitchBendsToNoteEvents(
    contours,
    mod.outputToNotesPoly(frames, onsets),
  );
  const timed = mod.noteFramesToTime(rawNotes);

  const mapped: NoteEvent[] = timed.map((n) => ({
    pitchMidi: n.pitchMidi,
    startSec: n.startTimeSeconds,
    durationSec: n.durationSeconds,
  }));

  return cleanMonophonic(mapped);
}

/**
 * Enforce a single melody line: sort by start, clip overlaps so no note starts
 * before the previous ends, and drop notes below the short-note floor.
 */
export function cleanMonophonic(notes: NoteEvent[]): NoteEvent[] {
  const ordered = notes
    .filter((n) => n.durationSec > 0)
    .sort((a, b) => a.startSec - b.startSec);

  for (let i = 0; i < ordered.length - 1; i++) {
    const current = ordered[i];
    const next = ordered[i + 1];
    const currentEnd = current.startSec + current.durationSec;
    if (currentEnd > next.startSec) {
      current.durationSec = Math.max(0, next.startSec - current.startSec);
    }
  }

  return ordered.filter((n) => n.durationSec >= MIN_NOTE_SEC);
}
