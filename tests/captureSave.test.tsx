import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "../src/copy/strings";

vi.mock("abcjs", () => ({
  default: { renderAbc: vi.fn(() => [{ tune: true }]) },
}));

vi.mock("../src/audio/decode", () => ({
  decodeToMono22050: vi.fn().mockResolvedValue(new Float32Array(22_050)),
  TARGET_SAMPLE_RATE: 22_050,
}));

vi.mock("../src/transcribe/basicPitch", () => ({
  warmUpModel: vi.fn().mockResolvedValue(undefined),
  transcribe: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/playback/player", () => {
  const player = {
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    dispose: vi.fn(),
  };
  return { createPlayer: () => player, getSharedPlayer: () => player, disposeSharedPlayer: vi.fn() };
});

vi.mock("../src/audio/recorder", () => {
  class RecorderError extends Error {
    kind: string;
    constructor(kind: string, message: string) {
      super(message);
      this.kind = kind;
    }
  }
  return { RecorderError, MAX_RECORDING_MS: 15000, startRecording: vi.fn() };
});

vi.mock("../src/db/entries", () => ({
  saveEntry: vi.fn(),
  countEntries: vi.fn().mockResolvedValue(0),
}));

import CaptureScreen from "../src/components/CaptureScreen";
import { startRecording } from "../src/audio/recorder";
import { transcribe } from "../src/transcribe/basicPitch";
import { saveEntry } from "../src/db/entries";

const NOTES = [
  { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
  { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
];

function fakeRecording() {
  return {
    stop: vi.fn().mockResolvedValue(new Blob(["hum"], { type: "audio/webm" })),
    cancel: vi.fn(),
  };
}

beforeEach(() => {
  vi.mocked(startRecording).mockReset().mockResolvedValue(fakeRecording() as never);
  vi.mocked(transcribe).mockReset().mockResolvedValue(NOTES);
  vi.mocked(saveEntry).mockReset();
});

async function toReady(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Record a hum/ }));
  const stop = await screen.findByRole("button", { name: strings.record.recording });
  await user.click(stop);
  await screen.findByRole("button", { name: strings.save.action });
}

describe("CaptureScreen save to songbook", () => {
  it("persists an Entry with notes, notation, audio blob, a title, and empty tags", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEntry).mockResolvedValue({ id: "e1" } as never);
    render(<CaptureScreen />);
    await toReady(user);

    await user.click(screen.getByRole("button", { name: strings.save.action }));

    expect(saveEntry).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(saveEntry).mock.calls[0][0];
    expect(arg.notes).toEqual(NOTES);
    expect(arg.notationAbc).toContain("X:1");
    expect(arg.audio).toBeInstanceOf(Blob);
    expect(arg.audioMimeType).toBe("audio/webm");
    expect(arg.durationSec).toBeCloseTo(1, 5);
    expect(arg.title.length).toBeGreaterThan(0);
    expect(arg.tags).toEqual([]);

    // Success shows the saved confirmation and a way to the songbook.
    expect(await screen.findByText(strings.save.saved)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings.save.viewInSongbook }),
    ).toBeInTheDocument();
  });

  it("shows the designed save-error state with retry when the save fails", async () => {
    const user = userEvent.setup();
    vi.mocked(saveEntry).mockRejectedValueOnce(new Error("quota"));
    render(<CaptureScreen />);
    await toReady(user);

    await user.click(screen.getByRole("button", { name: strings.save.action }));

    expect(await screen.findByText(strings.saveError.title)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings.saveError.action }),
    ).toBeInTheDocument();
    // The app stays usable: notation and Play are still on screen.
    expect(screen.getByTestId("notation-paper")).toBeInTheDocument();
  });
});
