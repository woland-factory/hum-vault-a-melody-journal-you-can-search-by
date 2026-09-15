import { zip, type Zippable } from "fflate";
import { listEntries } from "../db/entries";
import type { Entry, MelodyContour } from "../db/schema";
import type { NoteEvent } from "../transcribe/types";
import { notesToMusicXml } from "./musicXml";
import { notesToMidi } from "./midi";

// Full vault export: one zip with, per entry, the original audio, a MusicXML
// file, and a MIDI file, plus a manifest carrying everything a faithful
// re-import needs. Built and downloaded entirely on-device.

export const BACKUP_FORMAT = "hum-vault-backup";
export const BACKUP_VERSION = 1;

export interface BackupEntry {
  id: string;
  title: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  durationSec: number;
  audioMimeType: string;
  schemaVersion: number;
  notes: NoteEvent[];
  contour: MelodyContour;
  notationAbc: string;
  files: { audio: string; musicxml: string; midi: string };
}

export interface BackupManifest {
  format: string;
  version: number;
  exportedAt: number;
  entryCount: number;
  entries: BackupEntry[];
}

const EXT_FOR_MIME: Record<string, string> = {
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/m4a": ".m4a",
  "audio/aac": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/flac": ".flac",
};

export function extensionForMime(mime: string): string {
  const clean = (mime ?? "").toLowerCase().split(";")[0].trim();
  return EXT_FOR_MIME[clean] ?? ".bin";
}

// Read the whole corpus by paging listEntries; export must never cap at the
// search backstop or a page size.
async function readAllEntries(): Promise<Entry[]> {
  const all: Entry[] = [];
  let before: number | undefined;
  for (;;) {
    const page = await listEntries(before === undefined ? {} : { before });
    all.push(...page.entries);
    if (page.nextBefore === null) return all;
    before = page.nextBefore;
  }
}

export async function buildVaultZip(
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const entries = await readAllEntries();
  const total = entries.length;
  onProgress?.(0, total);

  const files: Zippable = {};
  const manifestEntries: BackupEntry[] = [];
  let done = 0;
  for (const entry of entries) {
    const dir = `entries/${entry.id}`;
    const audioPath = `${dir}/audio${extensionForMime(entry.audioMimeType)}`;
    const musicxmlPath = `${dir}/notation.musicxml`;
    const midiPath = `${dir}/notation.mid`;

    const audioBytes = new Uint8Array(await entry.audio.arrayBuffer());
    // Recorded audio is already compressed; store it without recompressing.
    files[audioPath] = [audioBytes, { level: 0 }];
    files[musicxmlPath] = new TextEncoder().encode(
      notesToMusicXml(entry.notes, { title: entry.title }),
    );
    files[midiPath] = notesToMidi(entry.notes);

    manifestEntries.push({
      id: entry.id,
      title: entry.title,
      tags: entry.tags,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      durationSec: entry.durationSec,
      audioMimeType: entry.audioMimeType,
      schemaVersion: entry.schemaVersion,
      notes: entry.notes,
      contour: entry.contour,
      notationAbc: entry.notationAbc,
      files: { audio: audioPath, musicxml: musicxmlPath, midi: midiPath },
    });

    done += 1;
    onProgress?.(done, total);
  }

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    entryCount: total,
    entries: manifestEntries,
  };
  files["manifest.json"] = new TextEncoder().encode(
    JSON.stringify(manifest, null, 2),
  );

  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    // Fixed mtime: zip entry timestamps carry no meaning here (the manifest
    // holds the real ones) and a constant keeps the archive deterministic.
    zip(files, { mtime: new Date("2024-01-01T00:00:00Z") }, (err, data) =>
      err ? reject(err) : resolve(data),
    );
  });
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}

export function downloadVaultZip(blob: Blob): void {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `hum-vault-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.zip`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
