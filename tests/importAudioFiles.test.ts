import { describe, it, expect, beforeEach, vi } from "vitest";
import { File as NodeFile } from "node:buffer";

vi.mock("../src/audio/decode", () => ({
  decodeToMono22050: vi.fn(),
  TARGET_SAMPLE_RATE: 22_050,
}));

vi.mock("../src/transcribe/basicPitch", () => ({
  transcribe: vi.fn(),
  warmUpModel: vi.fn().mockResolvedValue(undefined),
}));

import {
  importAudioFiles,
  defaultTitleFromFilename,
  MAX_IMPORT_DURATION_SEC,
  type FileImportItem,
} from "../src/import/importAudioFiles";
import { decodeToMono22050 } from "../src/audio/decode";
import { transcribe } from "../src/transcribe/basicPitch";
import {
  getEntry,
  saveEntry,
  listEntries,
  deleteEntry,
  countEntries,
} from "../src/db/entries";
import { computeContour } from "../src/melody/contour";
import { strings } from "../src/copy/strings";
import type { NoteEvent } from "../src/transcribe/types";

const NOTES: NoteEvent[] = [
  { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
  { pitchMidi: 62, startSec: 0.5, durationSec: 0.5 },
];

function audioFile(name: string, type = "audio/wav"): File {
  return new NodeFile([new Uint8Array([1, 2, 3])], name, { type }) as unknown as File;
}

async function clearAll() {
  const { entries } = await listEntries({ limit: 10_000 });
  for (const e of entries) await deleteEntry(e.id);
}

beforeEach(async () => {
  await clearAll();
  vi.mocked(decodeToMono22050).mockReset().mockResolvedValue(new Float32Array(22_050));
  vi.mocked(transcribe)
    .mockReset()
    .mockImplementation(async (_audio, onProgress) => {
      onProgress?.(0.5);
      onProgress?.(1);
      return NOTES;
    });
});

describe("importAudioFiles", () => {
  it("saves every valid file; each item reaches saved with its entryId", async () => {
    const updates: FileImportItem[][] = [];
    const items = await importAudioFiles(
      [audioFile("one.wav"), audioFile("two.wav")],
      (list) => updates.push(list),
    );

    expect(items.map((i) => i.status)).toEqual(["saved", "saved"]);
    expect(await countEntries()).toBe(2);
    for (const item of items) {
      expect(item.entryId).toBeTruthy();
      expect(item.progress).toBe(1);
      const entry = await getEntry(item.entryId!);
      expect(entry).toBeDefined();
      expect(entry!.notes).toEqual(NOTES);
    }
    // Titles default to the filename without extension.
    const titles = (await listEntries()).entries.map((e) => e.title).sort();
    expect(titles).toEqual(["one", "two"]);
  });

  it("emits an update on every transition, starting immediately with queued rows", async () => {
    const updates: FileImportItem[][] = [];
    await importAudioFiles([audioFile("one.wav")], (list) => updates.push(list));

    // First emit happens before any async work: all rows queued.
    expect(updates[0].map((i) => i.status)).toEqual(["queued"]);
    const statuses = updates.map((u) => u[0].status);
    expect(statuses).toContain("decoding");
    expect(statuses).toContain("reading");
    expect(statuses[statuses.length - 1]).toBe("saved");
    // Progress fraction is visible during "reading".
    const reading = updates.filter((u) => u[0].status === "reading");
    expect(reading.some((u) => u[0].progress > 0 && u[0].progress <= 1)).toBe(true);
    // Emitted lists are fresh copies, not shared mutable state.
    expect(updates[0][0]).not.toBe(updates[updates.length - 1][0]);
  });

  it("isolates failures: one bad file is marked and the rest still save", async () => {
    const items = await importAudioFiles(
      [audioFile("good.wav"), audioFile("bad.txt", "text/plain"), audioFile("also-good.wav")],
      () => {},
    );

    expect(items.map((i) => i.status)).toEqual(["saved", "skipped", "saved"]);
    expect(items[1].message).toBe(strings.import.skippedType);
    expect(await countEntries()).toBe(2);
  });

  it("skips an empty transcription with clear copy and continues", async () => {
    vi.mocked(transcribe)
      .mockResolvedValueOnce([])
      .mockImplementation(async () => NOTES);
    const items = await importAudioFiles(
      [audioFile("silent.wav"), audioFile("hum.wav")],
      () => {},
    );
    expect(items.map((i) => i.status)).toEqual(["skipped", "saved"]);
    expect(items[0].message).toBe(strings.import.skippedEmpty);
  });

  it("skips a recording over the duration cap before transcribing", async () => {
    vi.mocked(decodeToMono22050).mockResolvedValueOnce(
      new Float32Array(22_050 * (MAX_IMPORT_DURATION_SEC + 1)),
    );
    const items = await importAudioFiles([audioFile("long.wav")], () => {});
    expect(items[0].status).toBe("skipped");
    expect(items[0].message).toBe(strings.import.skippedLong);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("marks an unexpected decode error failed and continues", async () => {
    vi.mocked(decodeToMono22050)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(new Float32Array(22_050));
    const items = await importAudioFiles(
      [audioFile("broken.wav"), audioFile("fine.wav")],
      () => {},
    );
    expect(items.map((i) => i.status)).toEqual(["failed", "saved"]);
    expect(items[0].message).toBe(strings.import.failed);
    expect(await countEntries()).toBe(1);
  });

  it("stores the same contour the direct saveEntry path computes (search parity)", async () => {
    const [item] = await importAudioFiles([audioFile("hum.wav")], () => {});
    const imported = await getEntry(item.entryId!);

    const direct = await saveEntry({
      audio: new Blob([new Uint8Array([1])], { type: "audio/wav" }),
      audioMimeType: "audio/wav",
      durationSec: 1,
      notes: NOTES,
      notationAbc: "X:1\nK:C\nCD\n",
      title: "direct",
      tags: [],
    });

    expect(imported!.contour).toEqual(direct.contour);
    expect(imported!.contour).toEqual(computeContour(NOTES));
  });
});

describe("defaultTitleFromFilename", () => {
  it("strips the extension and trims", () => {
    expect(defaultTitleFromFilename("Voice Memo 12.m4a")).toBe("Voice Memo 12");
    expect(defaultTitleFromFilename("  riff .wav")).toBe("riff");
  });

  it("caps at the title limit", () => {
    expect(defaultTitleFromFilename(`${"x".repeat(300)}.wav`).length).toBe(120);
  });

  it("falls back to the date default when the name is empty", () => {
    expect(defaultTitleFromFilename(".wav").startsWith(strings.save.titlePrefix)).toBe(
      true,
    );
  });
});
