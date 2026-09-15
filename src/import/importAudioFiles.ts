import { validateAudioFile } from "./validateAudioFile";
import { decodeToMono22050, TARGET_SAMPLE_RATE } from "../audio/decode";
import { transcribe } from "../transcribe/basicPitch";
import { notesToAbc } from "../notation/notesToAbc";
import { saveEntry, ValidationError } from "../db/entries";
import { strings } from "../copy/strings";

// Bulk import: each file is validated, decoded, transcribed, and saved as an
// entry through the same saveEntry path as a live hum, so its contour is
// computed identically and search treats imported ideas the same. Files run
// sequentially (one inference at a time) with per-file progress, and one
// failing file never aborts the batch.

export const MAX_IMPORT_DURATION_SEC = 120;
const MAX_TITLE_LEN = 120; // mirrors the saveEntry boundary

export type FileImportStatus =
  | "queued"
  | "decoding"
  | "reading"
  | "saved"
  | "skipped"
  | "failed";

export interface FileImportItem {
  name: string;
  status: FileImportStatus;
  progress: number; // 0..1 transcription progress while "reading"
  message?: string;
  entryId?: string;
}

const MIME_FOR_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
};

function mimeTypeFor(file: File): string {
  const type = (file.type ?? "").split(";")[0].trim();
  if (type !== "") return type;
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  return MIME_FOR_EXT[ext] ?? "application/octet-stream";
}

/** Filename without its extension, trimmed to the title limit; date default when empty. */
export function defaultTitleFromFilename(name: string): string {
  const base = name.replace(/\.[^.]*$/, "").trim().slice(0, MAX_TITLE_LEN).trim();
  if (base.length > 0) return base;
  const date = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${strings.save.titlePrefix} ${date}`;
}

export async function importAudioFiles(
  files: File[],
  onUpdate: (items: FileImportItem[]) => void,
): Promise<FileImportItem[]> {
  const items: FileImportItem[] = files.map((file) => ({
    name: file.name,
    status: "queued",
    progress: 0,
  }));
  // Emit a fresh copy on every state change so React re-renders.
  const emit = () => onUpdate(items.map((item) => ({ ...item })));
  emit();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const item = items[i];
    try {
      validateAudioFile(file);

      item.status = "decoding";
      emit();
      const audio = await decodeToMono22050(file);
      const durationSec = audio.length / TARGET_SAMPLE_RATE;
      if (durationSec > MAX_IMPORT_DURATION_SEC) {
        item.status = "skipped";
        item.message = strings.import.skippedLong;
        emit();
        continue;
      }

      item.status = "reading";
      emit();
      const notes = await transcribe(audio, (fraction) => {
        item.progress = fraction;
        emit();
      });
      if (notes.length === 0) {
        item.status = "skipped";
        item.message = strings.import.skippedEmpty;
        emit();
        continue;
      }

      const entry = await saveEntry({
        audio: file,
        audioMimeType: mimeTypeFor(file),
        durationSec,
        notes,
        notationAbc: notesToAbc(notes),
        title: defaultTitleFromFilename(file.name),
        tags: [],
      });
      item.progress = 1;
      item.status = "saved";
      item.entryId = entry.id;
      emit();
    } catch (err) {
      // Validation problems are "skipped" with their own copy; anything
      // unexpected is "failed". Either way the batch continues.
      if (err instanceof ValidationError) {
        item.status = "skipped";
        item.message = err.message;
      } else {
        item.status = "failed";
        item.message = strings.import.failed;
      }
      emit();
    }
  }
  return items;
}
