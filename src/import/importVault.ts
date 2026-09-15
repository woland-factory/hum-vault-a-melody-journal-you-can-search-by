import { unzip, type Unzipped } from "fflate";
import { computeContour } from "../melody/contour";
import { putImportedEntry, ValidationError } from "../db/entries";
import { BACKUP_FORMAT, BACKUP_VERSION } from "../export/exportVault";
import { strings } from "../copy/strings";
import type { Entry } from "../db/schema";
import type { NoteEvent } from "../transcribe/types";

// Restore a vault backup zip. Everything is validated at the boundary before
// any DB write, one bad entry never blocks the rest, and re-importing the same
// zip is idempotent (putImportedEntry skips existing ids). The contour is
// recomputed from the notes rather than trusted from the manifest, so a stale
// or tampered manifest can never inject a bad search index.

export interface VaultImportResult {
  imported: number;
  skipped: number;
  failed: number;
  total: number;
}

// Backstop against absurd manifests; far above any hand-hummed transcription.
const MAX_NOTES = 10_000;

function badBackup(): ValidationError {
  return new ValidationError(strings.settings.importError.body);
}

function parseNotes(raw: unknown): NoteEvent[] {
  if (!Array.isArray(raw) || raw.length > MAX_NOTES) {
    throw new ValidationError("This backup entry has bad notes.");
  }
  return raw.map((n) => {
    const note = n as Record<string, unknown>;
    const pitchMidi = note.pitchMidi;
    const startSec = note.startSec;
    const durationSec = note.durationSec;
    if (
      typeof pitchMidi !== "number" ||
      !Number.isFinite(pitchMidi) ||
      typeof startSec !== "number" ||
      !Number.isFinite(startSec) ||
      typeof durationSec !== "number" ||
      !Number.isFinite(durationSec)
    ) {
      throw new ValidationError("This backup entry has bad notes.");
    }
    return { pitchMidi, startSec, durationSec };
  });
}

function requireFiniteNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError("This backup entry has bad fields.");
  }
  return value;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError("This backup entry has bad fields.");
  }
  return value;
}

// Build a full Entry from one manifest record plus the unzipped files, or
// throw. Field limits (title/tags/notation) are enforced by putImportedEntry.
function toEntry(raw: unknown, unzipped: Unzipped): Entry {
  const record = raw as Record<string, unknown>;
  const files = (record.files ?? {}) as Record<string, unknown>;
  const audioPath = requireString(files.audio);
  const audioBytes = unzipped[audioPath];
  if (!audioBytes) {
    throw new ValidationError("This backup entry has no audio file.");
  }
  const audioMimeType = requireString(record.audioMimeType);
  const notes = parseNotes(record.notes);
  return {
    id: requireString(record.id),
    title: requireString(record.title),
    createdAt: requireFiniteNumber(record.createdAt),
    updatedAt: requireFiniteNumber(record.updatedAt),
    audio: new Blob([audioBytes as BlobPart], { type: audioMimeType }),
    audioMimeType,
    durationSec: requireFiniteNumber(record.durationSec),
    notes,
    contour: computeContour(notes),
    notationAbc: requireString(record.notationAbc),
    tags: Array.isArray(record.tags) ? (record.tags as string[]) : [],
    schemaVersion: requireFiniteNumber(record.schemaVersion),
  };
}

export async function importVaultZip(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<VaultImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  let unzipped: Unzipped;
  try {
    unzipped = await new Promise<Unzipped>((resolve, reject) => {
      unzip(bytes, (err, data) => (err ? reject(err) : resolve(data)));
    });
  } catch {
    throw badBackup();
  }

  const manifestBytes = unzipped["manifest.json"];
  if (!manifestBytes) throw badBackup();

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as Record<
      string,
      unknown
    >;
  } catch {
    throw badBackup();
  }
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    manifest.format !== BACKUP_FORMAT ||
    manifest.version !== BACKUP_VERSION ||
    !Array.isArray(manifest.entries)
  ) {
    throw badBackup();
  }

  const records = manifest.entries as unknown[];
  const result: VaultImportResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    total: records.length,
  };
  onProgress?.(0, result.total);

  let done = 0;
  for (const raw of records) {
    try {
      const entry = toEntry(raw, unzipped);
      const outcome = await putImportedEntry(entry);
      if (outcome === "imported") result.imported += 1;
      else result.skipped += 1;
    } catch {
      // One bad entry never blocks the rest of the restore. Counts only; no
      // titles or file names in logs.
      result.failed += 1;
    }
    done += 1;
    onProgress?.(done, result.total);
  }
  return result;
}
