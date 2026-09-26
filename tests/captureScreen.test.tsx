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
  return {
    createPlayer: () => player,
    getSharedPlayer: () => player,
    disposeSharedPlayer: vi.fn(),
  };
});

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

vi.mock("../src/db/entries", () => ({
  saveEntry: vi.fn().mockResolvedValue({}),
  countEntries: vi.fn().mockResolvedValue(0),
}));

import CaptureScreen from "../src/components/CaptureScreen";
import { startRecording, RecorderError } from "../src/audio/recorder";
import { transcribe } from "../src/transcribe/basicPitch";
import { saveEntry, countEntries } from "../src/db/entries";
import { SEED_COMPLETE_EVENT } from "../src/demo/seedDemo";

const NOTES = [
  { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
  { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
];

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
  vi.mocked(saveEntry).mockReset().mockResolvedValue({} as never);
  vi.mocked(countEntries).mockReset().mockResolvedValue(0);
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

  it("gives the Record button an aria-pressed state that flips while recording (AC5.5)", async () => {
    const user = userEvent.setup();
    render(<CaptureScreen />);
    const idle = screen.getByRole("button", { name: /Record a hum/ });
    expect(idle).toHaveAttribute("aria-pressed", "false");

    await user.click(idle);
    const stop = await screen.findByRole("button", { name: strings.record.recording });
    expect(stop).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a synchronous pending cue on Record before the mic resolves (AC2.1)", async () => {
    const user = userEvent.setup();
    // getUserMedia is in flight: the button must give feedback before it settles.
    vi.mocked(startRecording).mockReturnValueOnce(new Promise(() => {}) as never);
    render(<CaptureScreen />);
    await user.click(screen.getByRole("button", { name: /Record a hum/ }));
    expect(screen.getByRole("button", { name: /Record a hum/ })).toBeDisabled();
  });

  it("disables and shows Saving synchronously when Save is tapped (AC2.1)", async () => {
    const user = userEvent.setup();
    vi.mocked(transcribe).mockResolvedValueOnce(NOTES);
    // The write never settles, so any Saving cue we see is the synchronous one.
    vi.mocked(saveEntry).mockReturnValueOnce(new Promise(() => {}) as never);
    render(<CaptureScreen />);
    await recordThenStop(user);

    await user.click(await screen.findByRole("button", { name: strings.save.action }));
    const saving = screen.getByRole("button", { name: strings.save.saving });
    expect(saving).toBeDisabled();
  });

  it("reveals the Songbook link after the demo seed settles, without a reload", async () => {
    // Cold visitor: the count read at mount is empty, so no link is shown yet.
    vi.mocked(countEntries).mockReset().mockResolvedValue(0);
    render(<CaptureScreen />);
    expect(
      await screen.findByRole("button", { name: /Record a hum/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: new RegExp(strings.nav.songbook) }),
    ).not.toBeInTheDocument();

    // The seed finishes after mount and announces itself: the count refreshes.
    vi.mocked(countEntries).mockResolvedValue(3);
    window.dispatchEvent(new Event(SEED_COMPLETE_EVENT));

    const link = await screen.findByRole("button", {
      name: new RegExp(strings.nav.songbook),
    });
    expect(link).toHaveTextContent("3");
  });

  it("announces a save failure assertively and a success politely (AC5.2)", async () => {
    const user = userEvent.setup();
    vi.mocked(transcribe).mockResolvedValue(NOTES);
    vi.mocked(saveEntry).mockRejectedValueOnce(new Error("boom"));
    render(<CaptureScreen />);
    await recordThenStop(user);
    await user.click(await screen.findByRole("button", { name: strings.save.action }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(strings.saveError.title);
    // The visible copy is the designed string, never the thrown error text.
    expect(screen.queryByText(/boom/)).not.toBeInTheDocument();

    // A successful save reports politely, not assertively.
    vi.mocked(saveEntry).mockResolvedValueOnce({} as never);
    await user.click(screen.getByRole("button", { name: strings.saveError.action }));
    const done = await screen.findByText(strings.save.saved);
    expect(done).toHaveAttribute("role", "status");
  });
});
