import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  saveEntry,
  getEntry,
  listEntries,
  listContours,
  updateEntry,
  deleteEntry,
  countEntries,
  putImportedEntry,
  ValidationError,
} from "../src/db/entries";
import type { Entry } from "../src/db/schema";
import { computeContour } from "../src/melody/contour";
import type { NoteEvent } from "../src/transcribe/types";

const notes: NoteEvent[] = [
  { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
  { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
  { pitchMidi: 67, startSec: 1.0, durationSec: 0.5 },
];

function makeInput(overrides: Partial<Parameters<typeof saveEntry>[0]> = {}) {
  return {
    audio: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }),
    audioMimeType: "audio/webm",
    durationSec: 1.5,
    notes,
    notationAbc: "X:1\nK:C\nCEG\n",
    title: "My idea",
    tags: ["draft"],
    ...overrides,
  };
}

// Clear the store through the public API so every test starts empty.
async function clearAll() {
  const { entries } = await listEntries({ limit: 10_000 });
  for (const e of entries) await deleteEntry(e.id);
}

beforeEach(clearAll);
afterEach(() => vi.restoreAllMocks());

describe("saveEntry / getEntry", () => {
  it("round-trips an entry including the audio Blob bytes and type", async () => {
    const saved = await saveEntry(makeInput());
    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBe(saved.updatedAt);
    expect(saved.schemaVersion).toBe(1);

    const got = await getEntry(saved.id);
    expect(got).toBeDefined();
    expect(got!.title).toBe("My idea");
    expect(got!.audio).toBeInstanceOf(Blob);
    expect(got!.audio.type).toBe("audio/webm");
    const bytes = new Uint8Array(await got!.audio.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it("stores a contour equal to computeContour(notes)", async () => {
    const saved = await saveEntry(makeInput());
    expect(saved.contour).toEqual(computeContour(notes));
    const got = await getEntry(saved.id);
    expect(got!.contour).toEqual(computeContour(notes));
  });

  it("returns undefined for a missing id", async () => {
    expect(await getEntry("does-not-exist")).toBeUndefined();
  });

  it("persists isDemo only when it is passed", async () => {
    const demo = await saveEntry(makeInput({ isDemo: true }));
    expect(demo.isDemo).toBe(true);
    expect((await getEntry(demo.id))!.isDemo).toBe(true);

    const real = await saveEntry(makeInput());
    expect(real.isDemo).toBeUndefined();
    expect((await getEntry(real.id))!.isDemo).toBeUndefined();
  });
});

describe("listEntries", () => {
  // Control createdAt so ordering is deterministic in a fast loop.
  it("returns entries newest first and pages with before/nextBefore", async () => {
    let clock = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 1));

    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const e = await saveEntry(makeInput({ title: `Idea ${i}` }));
      ids.push(e.id);
    }

    const page1 = await listEntries({ limit: 2 });
    expect(page1.entries.map((e) => e.title)).toEqual(["Idea 4", "Idea 3"]);
    expect(page1.nextBefore).toBe(page1.entries[1].createdAt);

    const page2 = await listEntries({ limit: 2, before: page1.nextBefore! });
    expect(page2.entries.map((e) => e.title)).toEqual(["Idea 2", "Idea 1"]);
    expect(page2.nextBefore).toBe(page2.entries[1].createdAt);

    const page3 = await listEntries({ limit: 2, before: page2.nextBefore! });
    expect(page3.entries.map((e) => e.title)).toEqual(["Idea 0"]);
    // A short final page means no more rows.
    expect(page3.nextBefore).toBeNull();
  });

  it("returns an empty page and null cursor with no entries", async () => {
    const { entries, nextBefore } = await listEntries();
    expect(entries).toEqual([]);
    expect(nextBefore).toBeNull();
  });
});

describe("listContours", () => {
  it("returns id, title, and contour for every entry, newest first, without the audio blob", async () => {
    let clock = 2_000;
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 1));
    await saveEntry(makeInput({ title: "First" }));
    await saveEntry(makeInput({ title: "Second" }));

    const candidates = await listContours();
    expect(candidates.map((c) => c.title)).toEqual(["Second", "First"]);
    for (const c of candidates) {
      expect(typeof c.id).toBe("string");
      expect(c.contour).toEqual(computeContour(notes));
      // No audio blob, no notes on a search candidate.
      const raw = c as unknown as Record<string, unknown>;
      expect(raw.audio).toBeUndefined();
      expect(raw.notes).toBeUndefined();
    }
  });

  it("returns an empty list with no entries", async () => {
    expect(await listContours()).toEqual([]);
  });
});

describe("updateEntry", () => {
  it("patches only title/tags/notationAbc and bumps updatedAt", async () => {
    let clock = 5_000;
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 10));
    const saved = await saveEntry(makeInput());

    const updated = await updateEntry(saved.id, {
      title: "Renamed",
      tags: ["a", "b"],
      notationAbc: "X:1\nK:G\nGGG\n",
    });

    expect(updated.title).toBe("Renamed");
    expect(updated.tags).toEqual(["a", "b"]);
    expect(updated.notationAbc).toBe("X:1\nK:G\nGGG\n");
    expect(updated.updatedAt).toBeGreaterThan(saved.updatedAt);
    expect(updated.createdAt).toBe(saved.createdAt);
    // notes and contour are immutable in this EPIC.
    expect(updated.notes).toEqual(saved.notes);
    expect(updated.contour).toEqual(saved.contour);
  });

  it("rejects updating a missing entry", async () => {
    await expect(updateEntry("nope", { title: "x" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("deleteEntry / countEntries", () => {
  it("removes an entry and reports the count", async () => {
    const a = await saveEntry(makeInput());
    await saveEntry(makeInput());
    expect(await countEntries()).toBe(2);
    await deleteEntry(a.id);
    expect(await countEntries()).toBe(1);
    expect(await getEntry(a.id)).toBeUndefined();
  });
});

describe("putImportedEntry", () => {
  function importedEntry(overrides: Partial<Entry> = {}): Entry {
    return {
      id: "imported-1",
      title: "Restored idea",
      createdAt: 1111,
      updatedAt: 2222,
      audio: new Blob([new Uint8Array([1, 2])], { type: "audio/webm" }),
      audioMimeType: "audio/webm",
      durationSec: 1,
      notes,
      contour: computeContour(notes),
      notationAbc: "X:1\nK:C\nCEG\n",
      tags: ["old"],
      schemaVersion: 1,
      ...overrides,
    };
  }

  it("imports a new entry preserving id, createdAt, updatedAt, and schemaVersion", async () => {
    expect(await putImportedEntry(importedEntry())).toBe("imported");
    const got = await getEntry("imported-1");
    expect(got).toBeDefined();
    expect(got!.createdAt).toBe(1111);
    expect(got!.updatedAt).toBe(2222);
    expect(got!.schemaVersion).toBe(1);
    expect(got!.title).toBe("Restored idea");
    expect(got!.tags).toEqual(["old"]);
  });

  it("returns skipped for an existing id without overwriting", async () => {
    await putImportedEntry(importedEntry());
    expect(
      await putImportedEntry(importedEntry({ title: "Sneaky overwrite" })),
    ).toBe("skipped");
    expect(await countEntries()).toBe(1);
    expect((await getEntry("imported-1"))!.title).toBe("Restored idea");
  });

  it("rejects invalid fields at the boundary", async () => {
    await expect(
      putImportedEntry(importedEntry({ title: "x".repeat(121) })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      putImportedEntry(importedEntry({ id: "" })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      putImportedEntry(importedEntry({ audio: undefined as unknown as Blob })),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      putImportedEntry(importedEntry({ notes: "nope" as unknown as Entry["notes"] })),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await countEntries()).toBe(0);
  });
});

describe("boundary validation", () => {
  it("rejects an oversize title", async () => {
    await expect(saveEntry(makeInput({ title: "x".repeat(121) }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects oversize notation", async () => {
    await expect(
      saveEntry(makeInput({ notationAbc: "x".repeat(20_001) })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects too many tags", async () => {
    const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    await expect(saveEntry(makeInput({ tags }))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an oversize tag", async () => {
    await expect(
      saveEntry(makeInput({ tags: ["x".repeat(31)] })),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a blank tag", async () => {
    await expect(saveEntry(makeInput({ tags: ["   "] }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("trims tags and drops duplicates before storing", async () => {
    const saved = await saveEntry(makeInput({ tags: ["  jazz ", "jazz", "blues"] }));
    expect(saved.tags).toEqual(["jazz", "blues"]);
  });
});
