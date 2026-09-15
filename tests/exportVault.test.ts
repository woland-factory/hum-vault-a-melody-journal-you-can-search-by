import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildVaultZip,
  extensionForMime,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupManifest,
} from "../src/export/exportVault";
import { saveEntry, listEntries, deleteEntry } from "../src/db/entries";
import type { NoteEvent } from "../src/transcribe/types";

const notes: NoteEvent[] = [
  { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
  { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
];

function makeInput(overrides: Partial<Parameters<typeof saveEntry>[0]> = {}) {
  return {
    audio: new Blob([new Uint8Array([9, 8, 7])], { type: "audio/webm" }),
    audioMimeType: "audio/webm",
    durationSec: 1,
    notes,
    notationAbc: "X:1\nK:C\nCE\n",
    title: "Backed up idea",
    tags: ["draft"],
    ...overrides,
  };
}

async function clearAll() {
  const { entries } = await listEntries({ limit: 10_000 });
  for (const e of entries) await deleteEntry(e.id);
}

async function unzipBlob(blob: Blob) {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

beforeEach(clearAll);
afterEach(() => vi.restoreAllMocks());

describe("extensionForMime", () => {
  it("maps known audio mimes and falls back to .bin", () => {
    expect(extensionForMime("audio/webm")).toBe(".webm");
    expect(extensionForMime("audio/mp4")).toBe(".m4a");
    expect(extensionForMime("audio/mpeg")).toBe(".mp3");
    expect(extensionForMime("audio/wav;codecs=1")).toBe(".wav");
    expect(extensionForMime("application/x-mystery")).toBe(".bin");
    expect(extensionForMime("")).toBe(".bin");
  });
});

describe("buildVaultZip", () => {
  it("zips manifest.json plus audio, musicxml, and midi per entry", async () => {
    const a = await saveEntry(makeInput({ title: "First" }));
    const b = await saveEntry(
      makeInput({ title: "Second", audioMimeType: "audio/mp4" }),
    );

    const blob = await buildVaultZip();
    expect(blob.type).toBe("application/zip");
    const files = await unzipBlob(blob);

    const manifest = JSON.parse(strFromU8(files["manifest.json"])) as BackupManifest;
    expect(manifest.format).toBe(BACKUP_FORMAT);
    expect(manifest.version).toBe(BACKUP_VERSION);
    expect(manifest.entryCount).toBe(2);
    expect(manifest.entries.map((e) => e.title).sort()).toEqual(["First", "Second"]);

    for (const entry of [a, b]) {
      const record = manifest.entries.find((e) => e.id === entry.id)!;
      expect(record.tags).toEqual(entry.tags);
      expect(record.createdAt).toBe(entry.createdAt);
      expect(record.updatedAt).toBe(entry.updatedAt);
      expect(record.notes).toEqual(entry.notes);
      expect(record.contour).toEqual(entry.contour);
      expect(record.notationAbc).toBe(entry.notationAbc);
      // The referenced files exist in the zip.
      expect(files[record.files.audio]).toBeDefined();
      expect(files[record.files.musicxml]).toBeDefined();
      expect(files[record.files.midi]).toBeDefined();
      // Audio bytes round-trip.
      expect(Array.from(files[record.files.audio])).toEqual([9, 8, 7]);
      // Derived files live under entries/<id>/ and match the entry's mime.
      expect(record.files.musicxml).toBe(`entries/${entry.id}/notation.musicxml`);
      expect(record.files.midi).toBe(`entries/${entry.id}/notation.mid`);
    }
    const aRecord = manifest.entries.find((e) => e.id === a.id)!;
    expect(aRecord.files.audio).toBe(`entries/${a.id}/audio.webm`);
    const bRecord = manifest.entries.find((e) => e.id === b.id)!;
    expect(bRecord.files.audio).toBe(`entries/${b.id}/audio.m4a`);
  });

  it("exports a corpus larger than one page fully, reporting progress", async () => {
    let clock = 10_000;
    vi.spyOn(Date, "now").mockImplementation(() => (clock += 1));
    const count = 35; // listEntries pages at 30
    for (let i = 0; i < count; i++) {
      await saveEntry(makeInput({ title: `Idea ${i}` }));
    }

    const progress: Array<[number, number]> = [];
    const blob = await buildVaultZip((done, total) => progress.push([done, total]));
    const files = await unzipBlob(blob);
    const manifest = JSON.parse(strFromU8(files["manifest.json"])) as BackupManifest;

    expect(manifest.entryCount).toBe(count);
    expect(manifest.entries.length).toBe(count);
    const titles = new Set(manifest.entries.map((e) => e.title));
    for (let i = 0; i < count; i++) expect(titles.has(`Idea ${i}`)).toBe(true);
    expect(progress[0]).toEqual([0, count]);
    expect(progress[progress.length - 1]).toEqual([count, count]);
  });

  it("exports an empty vault as a manifest-only zip", async () => {
    const files = await unzipBlob(await buildVaultZip());
    const manifest = JSON.parse(strFromU8(files["manifest.json"])) as BackupManifest;
    expect(manifest.entryCount).toBe(0);
    expect(manifest.entries).toEqual([]);
    expect(Object.keys(files)).toEqual(["manifest.json"]);
  });
});
