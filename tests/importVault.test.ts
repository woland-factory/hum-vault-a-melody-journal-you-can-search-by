import { describe, it, expect, beforeEach } from "vitest";
import { File as NodeFile } from "node:buffer";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { buildVaultZip, type BackupManifest } from "../src/export/exportVault";
import { importVaultZip } from "../src/import/importVault";
import {
  saveEntry,
  getEntry,
  listEntries,
  deleteEntry,
  countEntries,
  ValidationError,
} from "../src/db/entries";
import { computeContour } from "../src/melody/contour";
import type { NoteEvent } from "../src/transcribe/types";

const NOTES_A: NoteEvent[] = [
  { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
  { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
  { pitchMidi: 67, startSec: 1, durationSec: 0.5 },
];
const NOTES_B: NoteEvent[] = [
  { pitchMidi: 72, startSec: 0, durationSec: 0.25 },
  { pitchMidi: 71, startSec: 0.25, durationSec: 0.25 },
];

function makeInput(overrides: Partial<Parameters<typeof saveEntry>[0]> = {}) {
  return {
    audio: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "audio/webm" }),
    audioMimeType: "audio/webm",
    durationSec: 2,
    notes: NOTES_A,
    notationAbc: "X:1\nK:C\nCEG\n",
    title: "Round trip",
    tags: ["keep", "idea"],
    ...overrides,
  };
}

async function clearAll() {
  const { entries } = await listEntries({ limit: 10_000 });
  for (const e of entries) await deleteEntry(e.id);
}

function zipFile(bytes: Uint8Array, name = "backup.zip"): File {
  return new NodeFile([bytes], name, { type: "application/zip" }) as unknown as File;
}

async function blobToFile(blob: Blob): Promise<File> {
  return zipFile(new Uint8Array(await blob.arrayBuffer()));
}

beforeEach(clearAll);

describe("importVaultZip round-trip", () => {
  it("restores entries faithfully after a clear, recomputing equal contours", async () => {
    const a = await saveEntry(makeInput({ title: "Tune A" }));
    const b = await saveEntry(
      makeInput({ title: "Tune B", notes: NOTES_B, tags: [], notationAbc: "X:1\nK:C\ncB\n" }),
    );
    const backup = await blobToFile(await buildVaultZip());
    await clearAll();
    expect(await countEntries()).toBe(0);

    const progress: Array<[number, number]> = [];
    const result = await importVaultZip(backup, (done, total) =>
      progress.push([done, total]),
    );
    expect(result).toEqual({ imported: 2, skipped: 0, failed: 0, total: 2 });
    expect(progress[0]).toEqual([0, 2]);
    expect(progress[progress.length - 1]).toEqual([2, 2]);

    for (const original of [a, b]) {
      const restored = await getEntry(original.id);
      expect(restored).toBeDefined();
      expect(restored!.title).toBe(original.title);
      expect(restored!.tags).toEqual(original.tags);
      expect(restored!.notes).toEqual(original.notes);
      expect(restored!.notationAbc).toBe(original.notationAbc);
      expect(restored!.createdAt).toBe(original.createdAt);
      expect(restored!.updatedAt).toBe(original.updatedAt);
      expect(restored!.durationSec).toBe(original.durationSec);
      expect(restored!.schemaVersion).toBe(original.schemaVersion);
      // Contour is recomputed from notes and equals the exported one.
      expect(restored!.contour).toEqual(computeContour(original.notes));
      expect(restored!.contour).toEqual(original.contour);
      // Audio bytes and mime survive.
      expect(restored!.audioMimeType).toBe(original.audioMimeType);
      const bytes = new Uint8Array(await restored!.audio.arrayBuffer());
      expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("skips every entry and adds nothing when the same zip is imported twice", async () => {
    await saveEntry(makeInput({ title: "Tune A" }));
    await saveEntry(makeInput({ title: "Tune B", notes: NOTES_B }));
    const backup = await blobToFile(await buildVaultZip());

    const first = await importVaultZip(backup);
    expect(first).toEqual({ imported: 0, skipped: 2, failed: 0, total: 2 });
    expect(await countEntries()).toBe(2);

    const again = await importVaultZip(backup);
    expect(again).toEqual({ imported: 0, skipped: 2, failed: 0, total: 2 });
    expect(await countEntries()).toBe(2);
  });
});

describe("importVaultZip rejection", () => {
  it("rejects a file that is not a zip and writes nothing", async () => {
    const notZip = zipFile(new Uint8Array([1, 2, 3, 4, 5, 6]), "junk.zip");
    await expect(importVaultZip(notZip)).rejects.toBeInstanceOf(ValidationError);
    expect(await countEntries()).toBe(0);
  });

  it("rejects a zip without manifest.json", async () => {
    const zip = zipSync({ "readme.txt": strToU8("hello") });
    await expect(importVaultZip(zipFile(zip))).rejects.toBeInstanceOf(ValidationError);
    expect(await countEntries()).toBe(0);
  });

  it("rejects an unparseable manifest", async () => {
    const zip = zipSync({ "manifest.json": strToU8("{not json") });
    await expect(importVaultZip(zipFile(zip))).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unknown format or version and writes nothing", async () => {
    const wrongFormat = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({ format: "other-app", version: 1, entries: [] }),
      ),
    });
    await expect(importVaultZip(zipFile(wrongFormat))).rejects.toBeInstanceOf(
      ValidationError,
    );

    const wrongVersion = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({ format: "hum-vault-backup", version: 2, entries: [] }),
      ),
    });
    await expect(importVaultZip(zipFile(wrongVersion))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await countEntries()).toBe(0);
  });
});

describe("importVaultZip failure isolation", () => {
  async function tamperedBackup(
    tamper: (manifest: BackupManifest, files: Record<string, Uint8Array>) => void,
  ): Promise<File> {
    await saveEntry(makeInput({ title: "Good" }));
    await saveEntry(makeInput({ title: "Bad", notes: NOTES_B }));
    const blob = await buildVaultZip();
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const manifest = JSON.parse(strFromU8(files["manifest.json"])) as BackupManifest;
    tamper(manifest, files);
    files["manifest.json"] = strToU8(JSON.stringify(manifest));
    await clearAll();
    return zipFile(zipSync(files));
  }

  it("counts an entry with a missing audio file as failed while others import", async () => {
    const backup = await tamperedBackup((manifest, files) => {
      const bad = manifest.entries.find((e) => e.title === "Bad")!;
      delete files[bad.files.audio];
    });
    const result = await importVaultZip(backup);
    expect(result).toEqual({ imported: 1, skipped: 0, failed: 1, total: 2 });
    expect(await countEntries()).toBe(1);
    const { entries } = await listEntries();
    expect(entries[0].title).toBe("Good");
  });

  it("counts an entry with invalid fields as failed while others import", async () => {
    const backup = await tamperedBackup((manifest) => {
      const bad = manifest.entries.find((e) => e.title === "Bad")!;
      (bad as { notes: unknown }).notes = "not-an-array";
    });
    const result = await importVaultZip(backup);
    expect(result).toEqual({ imported: 1, skipped: 0, failed: 1, total: 2 });
    expect(await countEntries()).toBe(1);
  });
});
