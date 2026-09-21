import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startRecording, RecorderError } from "../src/audio/recorder";

// Safari records audio/mp4, Chromium records audio/webm, and the recorder must
// negotiate a container the running engine supports and tag the blob with the
// container it actually used, never a hardcoded type. These stubs stand in for
// the two engines so the negotiation is provable without a real microphone.
// Proves AC1.3.

let supportedTypes: string[];
// What the engine reports as its own mimeType when constructed with no explicit
// container (a Firefox-like default here, distinct from webm, so a test can
// tell "reads the real mimeType" apart from "hardcodes webm").
let defaultMimeType: string;
let lastConstructorOptions: { mimeType?: string } | undefined;

class FakeMediaRecorder {
  static isTypeSupported(type: string): boolean {
    return supportedTypes.includes(type);
  }
  mimeType: string;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: unknown, options?: { mimeType?: string }) {
    lastConstructorOptions = options;
    this.mimeType = options?.mimeType ?? defaultMimeType;
  }
  start(): void {
    this.state = "recording";
  }
  stop(): void {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["chunk"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

function fakeStream(audioTracks = 1) {
  const tracks = Array.from({ length: audioTracks }, () => ({ stop: vi.fn() }));
  return {
    getAudioTracks: () => tracks,
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

function setGetUserMedia(impl: (constraints: unknown) => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: impl },
  });
}

beforeEach(() => {
  supportedTypes = [];
  defaultMimeType = "audio/ogg";
  lastConstructorOptions = undefined;
  (globalThis as { MediaRecorder?: unknown }).MediaRecorder = FakeMediaRecorder;
  setGetUserMedia(vi.fn().mockResolvedValue(fakeStream(1)));
});

afterEach(() => {
  delete (globalThis as { MediaRecorder?: unknown }).MediaRecorder;
});

describe("startRecording mime negotiation", () => {
  it("tags the blob with the recorder's real mimeType, not a hardcoded type", async () => {
    // No supported types reported, so the browser default (audio/ogg here) wins.
    const rec = await startRecording();
    const blob = await rec.stop();
    expect(blob.type).toBe("audio/ogg");
    expect(lastConstructorOptions).toBeUndefined();
  });

  it("prefers a Safari-supported container when one is available", async () => {
    supportedTypes = ["audio/mp4", "audio/webm"];
    const rec = await startRecording();
    expect(lastConstructorOptions?.mimeType).toBe("audio/mp4");
    const blob = await rec.stop();
    expect(blob.type).toBe("audio/mp4");
  });

  it("falls back to webm when mp4 is not supported (Chromium)", async () => {
    supportedTypes = ["audio/webm"];
    const rec = await startRecording();
    expect(lastConstructorOptions?.mimeType).toBe("audio/webm");
    const blob = await rec.stop();
    expect(blob.type).toBe("audio/webm");
  });
});

describe("startRecording microphone failures under WebKit-class stubs", () => {
  it("maps a permission denial to the mic-denied state", async () => {
    setGetUserMedia(
      vi.fn().mockRejectedValue(
        Object.assign(new Error("no"), { name: "NotAllowedError" }),
      ),
    );
    await expect(startRecording()).rejects.toMatchObject({
      name: "RecorderError",
      kind: "mic-denied",
    });
  });

  it("maps a missing device to the no-mic state", async () => {
    setGetUserMedia(
      vi.fn().mockRejectedValue(
        Object.assign(new Error("gone"), { name: "NotFoundError" }),
      ),
    );
    await expect(startRecording()).rejects.toMatchObject({ kind: "no-mic" });
  });

  it("maps a stream with no audio track to the no-mic state", async () => {
    setGetUserMedia(vi.fn().mockResolvedValue(fakeStream(0)));
    await expect(startRecording()).rejects.toBeInstanceOf(RecorderError);
    await expect(startRecording()).rejects.toMatchObject({ kind: "no-mic" });
  });

  it("maps an absent getUserMedia to the no-mic state", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
    await expect(startRecording()).rejects.toMatchObject({ kind: "no-mic" });
  });
});
