import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "../src/copy/strings";

// Mock the heavy, browser-only modules so the component logic is testable.
vi.mock("abcjs", () => ({
  default: { renderAbc: vi.fn(() => [{ tune: true }]) },
}));

vi.mock("../src/audio/decode", () => ({
  decodeToMono22050: vi.fn().mockResolvedValue(new Float32Array(8)),
}));

vi.mock("../src/transcribe/basicPitch", () => ({
  warmUpModel: vi.fn().mockResolvedValue(undefined),
  transcribe: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/playback/player", () => ({
  createPlayer: () => ({
    play: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    dispose: vi.fn(),
  }),
}));

vi.mock("../src/audio/recorder", () => {
  class RecorderError extends Error {
    kind: string;
    constructor(kind: string, message: string) {
      super(message);
      this.kind = kind;
    }
  }
  return {
    RecorderError,
    MAX_RECORDING_MS: 15000,
    startRecording: vi.fn(),
  };
});

import CaptureScreen from "../src/components/CaptureScreen";
import { startRecording, RecorderError } from "../src/audio/recorder";
import { transcribe } from "../src/transcribe/basicPitch";

function fakeRecording() {
  return {
    stop: vi.fn().mockResolvedValue(new Blob(["x"])),
    cancel: vi.fn(),
  };
}

beforeEach(() => {
  vi.mocked(startRecording).mockReset();
  vi.mocked(startRecording).mockResolvedValue(fakeRecording() as never);
  vi.mocked(transcribe).mockReset();
  vi.mocked(transcribe).mockResolvedValue([]);
});

async function recordThenStop(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Record a hum/ }));
  const stop = await screen.findByRole("button", { name: strings.record.recording });
  await user.click(stop);
}

describe("CaptureScreen", () => {
  it("renders real content on first paint, not a spinner", () => {
    render(<CaptureScreen />);
    expect(screen.getByRole("heading", { name: strings.appName })).toBeInTheDocument();
    expect(screen.getByText(strings.tagline)).toBeInTheDocument();
    expect(screen.getByText(strings.disclaimer)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record a hum/ })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the mic-denied state with a next step when permission is refused", async () => {
    const user = userEvent.setup();
    vi.mocked(startRecording).mockRejectedValueOnce(
      new RecorderError("mic-denied", "denied"),
    );
    render(<CaptureScreen />);
    await user.click(screen.getByRole("button", { name: /Record a hum/ }));

    expect(await screen.findByText(strings.micDenied.title)).toBeInTheDocument();
    expect(screen.getByText(strings.micDenied.body)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings.micDenied.action }),
    ).toBeInTheDocument();
  });

  it("shows in-place progress while transcribing, never a blank screen", async () => {
    const user = userEvent.setup();
    vi.mocked(transcribe).mockReturnValueOnce(new Promise(() => {}) as never);
    render(<CaptureScreen />);
    await recordThenStop(user);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      new RegExp(`${strings.progress.transcribing}|${strings.progress.warming}`),
    );
    // The shell is still on screen: this is progress in place, not white.
    expect(screen.getByRole("heading", { name: strings.appName })).toBeInTheDocument();
  });

  it("renders notation and a Play control for a non-empty result", async () => {
    const user = userEvent.setup();
    vi.mocked(transcribe).mockResolvedValueOnce([
      { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
      { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
    ]);
    render(<CaptureScreen />);
    await recordThenStop(user);

    expect(
      await screen.findByRole("button", { name: strings.ready.play }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("notation-paper")).toBeInTheDocument();
  });

  it("shows the empty-result state when no clear notes are found", async () => {
    const user = userEvent.setup();
    vi.mocked(transcribe).mockResolvedValueOnce([]);
    render(<CaptureScreen />);
    await recordThenStop(user);

    expect(await screen.findByText(strings.emptyResult.title)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings.emptyResult.action }),
    ).toBeInTheDocument();
  });
});
