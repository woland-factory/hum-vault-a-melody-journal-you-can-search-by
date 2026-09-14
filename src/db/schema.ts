import type { NoteEvent } from "../transcribe/types";

// IndexedDB schema for the songbook. This is the first schema Hum Vault has
// persisted, so it starts at DB version 1.
//
// Forward-only migration policy: future EPICs bump DB_VERSION and add steps to
// the openDb onupgradeneeded handler. They never delete or destructively
// rewrite existing records. Each record carries schemaVersion, and each contour
// carries contour.version, so later code can detect and upgrade old records in
// place without losing anything the user saved.

export const DB_NAME = "humvault";
export const DB_VERSION = 1;
export const ENTRY_STORE = "entries";
export const CREATED_AT_INDEX = "byCreatedAt";
export const ENTRY_SCHEMA_VERSION = 1; // per-record schema version
export const CONTOUR_VERSION = 1; // contour algorithm version

// The melody search index, derived from an entry's notes at save time.
// EPIC 3 matches a hummed fragment against this. Intervals make the match
// key- and octave-independent; ioiRatios make rhythm tempo-independent.
export interface MelodyContour {
  version: number; // CONTOUR_VERSION at compute time
  noteCount: number; // notes.length (cheap length prefilter for search)
  intervals: number[]; // consecutive semitone deltas; length = max(0, n-1)
  ioiRatios: number[]; // consecutive inter-onset-interval ratios; length = max(0, n-2)
}

// A corpus row reduced to what matching needs: no audio blob, no notes. It is
// storage-shaped, so it lives beside Entry; both entries.ts and the matcher
// import it without coupling to each other.
export interface SearchCandidate {
  id: string;
  title: string;
  contour: MelodyContour;
}

export interface Entry {
  id: string; // crypto.randomUUID()
  title: string;
  createdAt: number; // epoch ms; the newest-first sort key
  updatedAt: number; // epoch ms
  audio: Blob; // the original recording, stored as a Blob
  audioMimeType: string; // blob.type at capture, e.g. "audio/webm"
  durationSec: number; // decoded audio length in seconds
  notes: NoteEvent[]; // the transcription (unchanged shape from EPIC 1)
  contour: MelodyContour; // derived from notes; the search index
  notationAbc: string; // editable draft ABC (from notesToAbc, then user edits)
  tags: string[];
  schemaVersion: number; // ENTRY_SCHEMA_VERSION at save time
}
