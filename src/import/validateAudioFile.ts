import { ValidationError } from "../db/entries";
import { strings } from "../copy/strings";

// Boundary validation for imported audio files: type and size are checked
// before any decode or inference work touches the file. Rejections carry the
// user-facing copy directly so the per-file rows can show them verbatim.

export const ACCEPTED_AUDIO = {
  mimeTypes: [
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
    "audio/aac",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/webm",
    "audio/ogg",
    "audio/flac",
  ],
  extensions: [".mp3", ".m4a", ".mp4", ".aac", ".wav", ".webm", ".ogg", ".flac"],
} as const;

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024; // 25 MB per file

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/**
 * Throw ValidationError with a clear per-file message when the file is not an
 * accepted audio type, is empty, or exceeds the size cap. Accepts by MIME
 * first; the extension covers files whose reported type is empty or
 * platform-odd (common for `.m4a`).
 */
export function validateAudioFile(file: File): void {
  const type = (file.type ?? "").toLowerCase().split(";")[0].trim();
  const typeOk =
    type !== "" && (ACCEPTED_AUDIO.mimeTypes as readonly string[]).includes(type);
  const extOk = (ACCEPTED_AUDIO.extensions as readonly string[]).includes(
    extensionOf(file.name ?? ""),
  );
  if (!typeOk && !extOk) {
    throw new ValidationError(strings.import.skippedType);
  }
  if (file.size === 0) {
    throw new ValidationError(strings.import.skippedEmptyFile);
  }
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ValidationError(strings.import.skippedSize);
  }
}
