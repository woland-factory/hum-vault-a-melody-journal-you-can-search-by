// Microphone capture. Requests permission, records to a Blob, enforces a hard
// length cap, and releases the mic track on stop so the browser indicator
// turns off.

export const MAX_RECORDING_MS = 15_000;

export type RecorderErrorKind = "mic-denied" | "no-mic" | "error";

export class RecorderError extends Error {
  kind: RecorderErrorKind;
  constructor(kind: RecorderErrorKind, message: string) {
    super(message);
    this.name = "RecorderError";
    this.kind = kind;
  }
}

export interface Recording {
  /** Stop recording, release the mic, and resolve with the captured audio. */
  stop(): Promise<Blob>;
  /** Stop and release the mic without resolving a blob. */
  cancel(): void;
}

function classifyGetUserMediaError(err: unknown): RecorderErrorKind {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "mic-denied";
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "OverconstrainedError"
  ) {
    return "no-mic";
  }
  return "error";
}

export async function startRecording(options: {
  maxMs?: number;
  onAutoStop?: () => void;
} = {}): Promise<Recording> {
  const maxMs = options.maxMs ?? MAX_RECORDING_MS;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new RecorderError("no-mic", "This browser cannot access a microphone.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    throw new RecorderError(classifyGetUserMediaError(err), "Microphone unavailable.");
  }

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new RecorderError("no-mic", "No audio track available.");
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  const releaseTracks = () => stream.getTracks().forEach((t) => t.stop());

  let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let resolveStop: ((blob: Blob) => void) | null = null;

  recorder.onstop = () => {
    if (autoStopTimer) clearTimeout(autoStopTimer);
    releaseTracks();
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    resolveStop?.(blob);
  };

  recorder.start();

  // At the cap, notify the UI and let it drive the single stop() call. This
  // avoids stopping the recorder twice when the user also taps Stop.
  autoStopTimer = setTimeout(() => {
    if (recorder.state !== "inactive") options.onAutoStop?.();
  }, maxMs);

  return {
    stop(): Promise<Blob> {
      if (settled) return Promise.reject(new RecorderError("error", "Already stopped."));
      settled = true;
      return new Promise<Blob>((resolve) => {
        resolveStop = resolve;
        if (recorder.state === "inactive") {
          releaseTracks();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        } else {
          recorder.stop();
        }
      });
    },
    cancel() {
      if (autoStopTimer) clearTimeout(autoStopTimer);
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        // ignore
      }
      releaseTracks();
    },
  };
}
