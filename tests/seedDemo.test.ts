import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NoteEvent } from "../src/transcribe/types";

// Mock the heavy, browser-only pipeline so seeding runs deterministically in
// jsdom. The database, meta store, contour, and matcher are all real.
vi.mock("../src/audio/decode", () => ({
  decodeToMono22050: vi.fn().mockResolvedValue(new Float32Array(22_050)),
  TARGET_SAMPLE_RATE: 22_050,
}));

vi.mock("../src/transcribe/basicPitch", () => ({
  warmUpModel: vi.fn().mockResolvedValue(undefined),
  transcribe: vi.fn(),
}));

import {
  seedDemoIfEnabled,
  clearDemoEntries,
  hasDemoEntries,
} from "../src/demo/seedDemo";
import { DEMO_CLIPS } from "../src/demo/demoData";
import { transcribe, warmUpModel } from "../src/transcribe/basicPitch";
import {
  saveEntry,
  listEntries,
  listContours,
  deleteEntry,
  openDb,
} from "../src/db/entries";
import { getMeta, DEMO_SEEDED } from "../src/db/meta";
import { META_STORE } from "../src/db/schema";
import { computeContour } from "../src/melody/contour";
import { rankMatches } from "../src/melody/search";

// Distinct melodies per clip. The FIRST clip is the example the search screen
// uses, so its notes are what a scripted query transcribes to as well.
const EXAMPLE_NOTES: NoteEvent[] = [60, 64, 67, 72].map((p, i) => ({
  pitchMidi: p,
  startSec: i * 0.5,
  durationSec: 0.5,
}));
const STAIR_NOTES: NoteEvent[] = [60, 62, 64, 65].map((p, i) => ({
  pitchMidi: p,
  startSec: i * 0.5,
  durationSec: 0.5,
}));
const BRIDGE_NOTES: NoteEvent[] = [67, 65, 62].map((p, i) => ({
  pitchMidi: p,
  startSec: i * 0.5,
  durationSec: 0.5,
}));

function makeRealInput(title: string) {
  return {
    audio: new Blob([new Uint8Array([9, 9, 9])], { type: "audio/webm" }),
    audioMimeType: "audio/webm",
    durationSec: 1,
    notes: [
      { pitchMidi: 55, startSec: 0, durationSec: 0.5 },
      { pitchMidi: 57, startSec: 0.5, durationSec: 0.5 },
    ] as NoteEvent[],
    notationAbc: "X:1\nK:C\nGA\n",
    title,
    tags: [],
  };
}

async function clearAll() {
  const { entries } = await listEntries({ limit: 10_000 });
  for (const e of entries) await deleteEntry(e.id);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Feed transcribe the notes for each clip, in seed order (example first).
function primeTranscribe() {
  vi.mocked(transcribe)
    .mockReset()
    .mockResolvedValueOnce(EXAMPLE_NOTES)
    .mockResolvedValueOnce(STAIR_NOTES)
    .mockResolvedValueOnce(BRIDGE_NOTES);
}

beforeEach(async () => {
  await clearAll();
  primeTranscribe();
  vi.mocked(warmUpModel).mockResolvedValue(undefined);
  delete window.__HUMVAULT_ENV__;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }),
  }) as unknown as typeof fetch;
});

describe("seedDemoIfEnabled", () => {
  it("seeds one demo entry per clip and sets the flag when enabled", async () => {
    window.__HUMVAULT_ENV__ = { SEED_DEMO: "1" };
    await seedDemoIfEnabled();

    const { entries } = await listEntries({ limit: 100 });
    expect(entries).toHaveLength(DEMO_CLIPS.length);
    expect(entries.every((e) => e.isDemo === true)).toBe(true);
    expect(await getMeta<boolean>(DEMO_SEEDED)).toBe(true);

    // Each entry plays a real melody: non-empty notes and notation (AC3.5).
    for (const e of entries) {
      expect(e.notes.length).toBeGreaterThan(0);
      expect(e.notationAbc.trim().length).toBeGreaterThan(0);
    }

    // Titles come from the clip list.
    const titles = entries.map((e) => e.title).sort();
    expect(titles).toEqual(DEMO_CLIPS.map((c) => c.title).sort());
  });

  it("is idempotent: a second call seeds nothing", async () => {
    window.__HUMVAULT_ENV__ = { SEED_DEMO: "1" };
    await seedDemoIfEnabled();
    const first = (await listEntries({ limit: 100 })).entries.length;

    // A second call must not seed again (guarded by the demoSeeded flag).
    primeTranscribe();
    await seedDemoIfEnabled();
    const second = (await listEntries({ limit: 100 })).entries.length;
    expect(second).toBe(first);
    expect(transcribe).not.toHaveBeenCalled(); // reset above, never called again
  });

  it("does nothing when the flag is off", async () => {
    delete window.__HUMVAULT_ENV__;
    await seedDemoIfEnabled();
    expect((await listEntries({ limit: 100 })).entries).toHaveLength(0);
    expect(await getMeta<boolean>(DEMO_SEEDED)).toBeUndefined();
  });

  it("returns the example-derived entry as the top match for the example query", async () => {
    window.__HUMVAULT_ENV__ = { SEED_DEMO: "1" };
    await seedDemoIfEnabled();

    // The scripted no-mic query transcribes the same example file to the same
    // notes, so its contour matches the seeded example entry exactly.
    const query = computeContour(EXAMPLE_NOTES);
    const candidates = await listContours();
    const matches = rankMatches(query, candidates);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].title).toBe(DEMO_CLIPS[0].title);
    expect(matches[0].score).toBeCloseTo(0, 5);
  });

  it("skips a clip that transcribes to nothing and continues", async () => {
    window.__HUMVAULT_ENV__ = { SEED_DEMO: "1" };
    // The middle clip yields no notes; the other two still seed.
    vi.mocked(transcribe)
      .mockReset()
      .mockResolvedValueOnce(EXAMPLE_NOTES)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(BRIDGE_NOTES);

    await seedDemoIfEnabled();
    const { entries } = await listEntries({ limit: 100 });
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.notes.length > 0)).toBe(true);
  });
});

describe("clearDemoEntries / hasDemoEntries", () => {
  it("removes only demo entries and leaves real ones", async () => {
    // A real, user-saved idea alongside the demo seed.
    await saveEntry(makeRealInput("Real idea"));
    window.__HUMVAULT_ENV__ = { SEED_DEMO: "1" };
    await seedDemoIfEnabled();

    expect(await hasDemoEntries()).toBe(true);
    const removed = await clearDemoEntries();
    expect(removed).toBe(DEMO_CLIPS.length);

    const { entries } = await listEntries({ limit: 100 });
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe("Real idea");
    expect(entries[0].isDemo).toBeUndefined();
    expect(await hasDemoEntries()).toBe(false);
  });

  it("reports no demo entries on an empty vault", async () => {
    expect(await hasDemoEntries()).toBe(false);
    expect(await clearDemoEntries()).toBe(0);
  });
});
