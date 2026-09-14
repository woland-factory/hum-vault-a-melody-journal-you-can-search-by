import type { MelodyContour, SearchCandidate } from "../db/schema";

// The melodic matcher: the heart of Hum Vault's "recall by ear". It compares a
// hummed query fragment against a stored entry's contour with a subsequence
// dynamic-time-warp (DTW), and ranks the whole corpus closest-first. Pure and
// deterministic: no DOM, no DB, no audio, no clock. The same inputs always
// yield the same ranking.
//
// Why this is key- and tempo-independent: the step features below are built
// from the contour's own relative intervals and ratio-based rhythm, so a
// fragment transposed to another octave or hummed faster/slower produces the
// SAME step values. No transposition search is needed.
//
// Why a genuine fragment ranks first: a real fragment's intervals are a
// contiguous slice of the entry's intervals. Open-begin lets DTW start the
// alignment at the right offset for free; along that diagonal every localCost
// is ~0; open-end lets it stop there. So the true entry scores near 0 while
// unrelated entries accrue cost at every step.

// Tuning constants (part of DONE). Tuned so the documented fixture passes: a
// genuine, transposed, slightly-imperfect fragment ranks its entry in the top
// 3, and an unrelated fragment returns no match. Changing a default means the
// fixture test is what proves the new value is right.
const RHYTHM_WEIGHT = 0.5; // pitch dominates; shaky rhythm only breaks ties
const MIN_QUERY_STEPS = 2; // a 3-note hum: "the three notes you still remember"
const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_SCORE = 2.5; // avg semitones of disagreement per step
const EPS = 1e-4; // guards log2 of a zero/negative ratio

interface Step {
  pitch: number; // relative semitone delta; already key/octave-independent
  rhythm: number; // log2 of the onset-interval ratio; already tempo-independent
}

// Build a per-transition feature array of length intervals.length. The last
// interval has no following ratio, so its rhythm feature is the neutral 0.
// log2 of a ratio is symmetric: twice-as-long and half-as-long sit equidistant
// from 0.
function steps(contour: MelodyContour): Step[] {
  const { intervals, ioiRatios } = contour;
  const out: Step[] = [];
  for (let i = 0; i < intervals.length; i++) {
    const rhythm =
      i < ioiRatios.length ? Math.log2(Math.max(ioiRatios[i], EPS)) : 0;
    out.push({ pitch: intervals[i], rhythm });
  }
  return out;
}

function localCost(q: Step, e: Step): number {
  return Math.abs(q.pitch - e.pitch) + RHYTHM_WEIGHT * Math.abs(q.rhythm - e.rhythm);
}

/**
 * Subsequence DTW distance of a query fragment against an entry contour.
 * Lower is closer; a fragment that is an exact slice of the entry scores ~0.
 * Open-begin and open-end on the entry side: the match may begin and end at
 * any entry position for free, but the query cannot skip its own notes. The
 * result is normalized by query length so it is a per-step average distance
 * the no-match threshold can reason about. Never throws on odd input; returns
 * Infinity when there is too little to match.
 */
export function matchContour(query: MelodyContour, entry: MelodyContour): number {
  const Q = steps(query);
  const E = steps(entry);
  const m = Q.length;
  const n = E.length;
  if (m < MIN_QUERY_STEPS || n === 0) return Infinity;

  // Rolling two-row buffer: O(n) memory, O(m*n) time. No full m*n matrix.
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  // Row 0: a match may BEGIN at any entry position, free.
  for (let j = 0; j <= n; j++) prev[j] = 0;

  for (let i = 1; i <= m; i++) {
    curr[0] = Infinity; // the query cannot skip its own notes
    for (let j = 1; j <= n; j++) {
      const c = localCost(Q[i - 1], E[j - 1]);
      const diag = prev[j - 1]; // align this pair
      const up = prev[j]; // query advances, entry waits (query note absorbed)
      const left = curr[j - 1]; // entry advances, query waits (entry note skipped)
      curr[j] = c + Math.min(diag, up, left);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }

  // A match may END at any entry position.
  let best = Infinity;
  for (let j = 1; j <= n; j++) {
    if (prev[j] < best) best = prev[j];
  }
  return best / m; // normalize by query length -> comparable, thresholdable
}

// Lower score = closer.
export interface SearchMatch {
  id: string;
  title: string;
  score: number;
}

/**
 * Score every candidate with matchContour, drop Infinity and any score above
 * maxScore, sort ascending with a deterministic id tiebreak, and return at
 * most limit matches. Returns [] for an empty corpus or a below-minimum query
 * and never throws. "within about one second of finishing" is measured from
 * transcription producing notes to results rendering; this match step is
 * trivially fast (hundreds of ~20-note contours in well under 100ms) and needs
 * no vector database.
 */
export function rankMatches(
  query: MelodyContour,
  candidates: SearchCandidate[],
  opts?: { limit?: number; maxScore?: number },
): SearchMatch[] {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const maxScore = opts?.maxScore ?? DEFAULT_MAX_SCORE;
  if (!query || !Array.isArray(candidates) || candidates.length === 0) return [];

  const scored: SearchMatch[] = [];
  for (const candidate of candidates) {
    const score = matchContour(query, candidate.contour);
    if (!Number.isFinite(score) || score > maxScore) continue;
    scored.push({ id: candidate.id, title: candidate.title, score });
  }

  // Sort by score ascending; break ties by id ascending so the ranking is
  // stable across engines and test runs.
  scored.sort((a, b) => (a.score !== b.score ? a.score - b.score : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return scored.slice(0, Math.max(0, limit));
}
