import { describe, it, expect } from "vitest";
import { matchContour, rankMatches } from "../src/melody/search";
import { computeContour } from "../src/melody/contour";
import type { NoteEvent } from "../src/transcribe/types";
import type { SearchCandidate } from "../src/db/schema";
import {
  buildCorpus,
  CORPUS_MELODIES,
  fragmentOf,
  unrelatedQuery,
} from "./fixtures/searchCorpus";

const corpus = buildCorpus();

function rankOf(id: string, matches: { id: string }[]): number {
  return matches.findIndex((m) => m.id === id);
}

describe("matchContour", () => {
  it("scores an exact fragment near zero against its entry", () => {
    const entry = computeContour(CORPUS_MELODIES.risingRun);
    const query = fragmentOf(CORPUS_MELODIES.risingRun, 2, 4);
    // Open-begin/open-end aligns the slice for free; every localCost is ~0.
    expect(matchContour(query, entry)).toBeLessThan(0.6);
  });

  it("is key-independent: transposing the query leaves the score unchanged", () => {
    const entry = computeContour(CORPUS_MELODIES.arpeggio);
    const base = matchContour(fragmentOf(CORPUS_MELODIES.arpeggio, 1, 5), entry);
    for (const transpose of [-24, -12, -5, 7, 12, 19]) {
      const score = matchContour(
        fragmentOf(CORPUS_MELODIES.arpeggio, 1, 5, { transpose }),
        entry,
      );
      expect(score).toBeCloseTo(base, 10);
    }
  });

  it("is tempo-independent: scaling onset times leaves the score unchanged", () => {
    const entry = computeContour(CORPUS_MELODIES.descending);
    const base = matchContour(fragmentOf(CORPUS_MELODIES.descending, 0, 5), entry);
    for (const tempoScale of [0.6, 1.0, 1.7, 3.2]) {
      const score = matchContour(
        fragmentOf(CORPUS_MELODIES.descending, 0, 5, { tempoScale }),
        entry,
      );
      expect(score).toBeCloseTo(base, 10);
    }
  });

  it("never throws on empty, one-note, or below-minimum contours", () => {
    const empty = computeContour([]);
    const one: NoteEvent[] = [{ pitchMidi: 60, startSec: 0, durationSec: 0.5 }];
    const oneContour = computeContour(one);
    const entry = computeContour(CORPUS_MELODIES.risingRun);
    expect(matchContour(empty, entry)).toBe(Infinity);
    expect(matchContour(oneContour, entry)).toBe(Infinity);
    // A 2-note query has 1 interval, below MIN_QUERY_STEPS (2).
    const twoNote = computeContour([
      { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
      { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
    ]);
    expect(matchContour(twoNote, entry)).toBe(Infinity);
    // A valid query against an empty entry cannot match.
    expect(matchContour(computeContour(CORPUS_MELODIES.risingRun), empty)).toBe(Infinity);
  });
});

describe("rankMatches — the documented top-3 criterion", () => {
  it("ranks a genuine transposed, tempo-scaled fragment as the top match", () => {
    const query = fragmentOf(CORPUS_MELODIES.arpeggio, 2, 5, {
      transpose: 12,
      tempoScale: 1.3,
    });
    const matches = rankMatches(query, corpus);
    expect(matches.length).toBeGreaterThan(0);
    // Strong form: the true entry is #1. Criterion floor is top 3.
    expect(matches[0].id).toBe("arpeggio");
    expect(rankOf("arpeggio", matches)).toBeLessThan(3);
  });

  it("stays in the top 3 across many transpositions (key independence)", () => {
    for (const transpose of [-12, -5, 7, 19]) {
      const query = fragmentOf(CORPUS_MELODIES.descending, 1, 5, { transpose });
      const matches = rankMatches(query, corpus);
      expect(rankOf("descending", matches)).toBeGreaterThanOrEqual(0);
      expect(rankOf("descending", matches)).toBeLessThan(3);
    }
  });

  it("stays in the top 3 across tempo scales (tempo independence)", () => {
    for (const tempoScale of [0.6, 1.0, 1.7]) {
      const query = fragmentOf(CORPUS_MELODIES.repeatedMotif, 0, 6, { tempoScale });
      const matches = rankMatches(query, corpus);
      expect(rankOf("repeatedMotif", matches)).toBeGreaterThanOrEqual(0);
      expect(rankOf("repeatedMotif", matches)).toBeLessThan(3);
    }
  });

  it("keeps a slightly imperfect hum in the top 3 and above every unrelated entry", () => {
    const query = fragmentOf(CORPUS_MELODIES.zigzag, 1, 6, {
      transpose: -7,
      tempoScale: 1.2,
      perturbAt: 2,
    });
    const matches = rankMatches(query, corpus);
    const rank = rankOf("zigzag", matches);
    expect(rank).toBeGreaterThanOrEqual(0);
    expect(rank).toBeLessThan(3);
    // Every other returned match scores no better than the true entry.
    const trueScore = matches[rank].score;
    for (const m of matches) {
      if (m.id !== "zigzag") expect(m.score).toBeGreaterThanOrEqual(trueScore);
    }
  });

  it("returns [] for a query unrelated to the whole corpus (no-match state)", () => {
    expect(rankMatches(unrelatedQuery(), corpus)).toEqual([]);
  });

  it("returns [] for a below-minimum query", () => {
    const twoNote = computeContour([
      { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
      { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
    ]);
    expect(rankMatches(twoNote, corpus)).toEqual([]);
  });

  it("returns [] for an empty corpus and never throws on odd input", () => {
    const query = fragmentOf(CORPUS_MELODIES.risingRun, 0, 5);
    expect(rankMatches(query, [])).toEqual([]);
    expect(rankMatches(computeContour([]), corpus)).toEqual([]);
  });

  it("is deterministic and breaks ties by id ascending", () => {
    const query = fragmentOf(CORPUS_MELODIES.wave, 0, 6, { transpose: 5 });
    const a = rankMatches(query, corpus);
    const b = rankMatches(query, corpus);
    expect(a).toEqual(b);

    // Two candidates with the identical contour must order by id ascending.
    const shared = computeContour(CORPUS_MELODIES.risingRun);
    const tied: SearchCandidate[] = [
      { id: "zeta", title: "Z", contour: shared },
      { id: "alpha", title: "A", contour: shared },
    ];
    const tiedQuery = fragmentOf(CORPUS_MELODIES.risingRun, 0, 5);
    const ranked = rankMatches(tiedQuery, tied);
    expect(ranked.map((m) => m.id)).toEqual(["alpha", "zeta"]);
  });

  it("respects the limit and maxScore options", () => {
    const query = fragmentOf(CORPUS_MELODIES.arpeggio, 0, 6);
    expect(rankMatches(query, corpus, { limit: 1 }).length).toBeLessThanOrEqual(1);
    // An impossibly tight threshold drops everything.
    expect(rankMatches(query, corpus, { maxScore: -1 })).toEqual([]);
  });

  it("perf guardrail: ranks a ~1000-contour corpus well under budget", () => {
    const big: SearchCandidate[] = [];
    for (let i = 0; i < 1000; i++) {
      // Vary each synthetic melody so contours differ but stay ~20 notes.
      const pitches: number[] = [];
      let p = 60 + (i % 12);
      for (let k = 0; k < 20; k++) {
        p += ((i + k) % 5) - 2;
        pitches.push(p);
      }
      const notes: NoteEvent[] = pitches.map((pitch, k) => ({
        pitchMidi: pitch,
        startSec: k * 0.5,
        durationSec: 0.5,
      }));
      big.push({ id: `e${i}`, title: `e${i}`, contour: computeContour(notes) });
    }
    const query = fragmentOf(CORPUS_MELODIES.arpeggio, 0, 6);
    const start = performance.now();
    rankMatches(query, big);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });
});
