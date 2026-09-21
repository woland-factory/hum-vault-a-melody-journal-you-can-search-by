import { describe, it, expect, beforeAll } from "vitest";
import { saveEntry, listEntries, listContours } from "../src/db/entries";
import { rankMatches } from "../src/melody/search";
import type { NoteEvent } from "../src/transcribe/types";

// The corpus-scale guard for the two hot paths (AC2.2, AC2.3). It seeds several
// hundred real entries through the real save path, then proves the songbook
// list reads one page regardless of size and the search read stays tiny and
// fast. A regression that scans the whole store, or drags audio/notes onto the
// search path, fails here.

const CORPUS_SIZE = 300;
const DEFAULT_PAGE_SIZE = 30;

function melodyNotes(seed: number): NoteEvent[] {
  const notes: NoteEvent[] = [];
  let pitch = 60 + (seed % 12);
  for (let k = 0; k < 12; k++) {
    pitch += ((seed + k) % 5) - 2;
    notes.push({ pitchMidi: pitch, startSec: k * 0.5, durationSec: 0.5 });
  }
  return notes;
}

beforeAll(async () => {
  for (let i = 0; i < CORPUS_SIZE; i++) {
    await saveEntry({
      audio: new Blob(["x"], { type: "audio/webm" }),
      audioMimeType: "audio/webm",
      durationSec: 6,
      notes: melodyNotes(i),
      notationAbc: "X:1\nK:C\nCDEFGA\n",
      title: `Idea ${i}`,
      tags: [],
    });
  }
});

describe("songbook read stays bounded as the corpus grows (AC2.2)", () => {
  it("reads exactly one page and reports there is more", async () => {
    const page = await listEntries({ limit: DEFAULT_PAGE_SIZE });
    expect(page.entries).toHaveLength(DEFAULT_PAGE_SIZE);
    // A full page means more may exist: the cursor stopped at the page boundary
    // instead of scanning all 300 rows.
    expect(page.nextBefore).not.toBeNull();
    expect(typeof page.nextBefore).toBe("number");
  });
});

describe("search read is cheap and audio/notes-free at scale (AC2.3)", () => {
  it("returns only { id, title, contour } per entry", async () => {
    const candidates = await listContours();
    expect(candidates).toHaveLength(CORPUS_SIZE);
    for (const row of candidates.slice(0, 5)) {
      expect(Object.keys(row).sort()).toEqual(["contour", "id", "title"]);
      expect(row).not.toHaveProperty("audio");
      expect(row).not.toHaveProperty("notes");
    }
  });

  it("ranks several hundred contours well under the documented budget", async () => {
    const candidates = await listContours();
    const query = candidates[0].contour; // a real corpus contour as the query
    const start = performance.now();
    const matches = rankMatches(query, candidates);
    const elapsed = performance.now() - start;
    // The documented guardrail is sub-500ms; hundreds of ~12-note contours run
    // far under it.
    expect(elapsed).toBeLessThan(500);
    expect(matches.length).toBeGreaterThan(0);
  });
});
