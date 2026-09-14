import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "../src/copy/strings";
import type { Entry, SearchCandidate } from "../src/db/schema";
import { computeContour } from "../src/melody/contour";
import type { NoteEvent } from "../src/transcribe/types";

// Mock the heavy, browser-only modules so the screen logic is testable.
vi.mock("../src/db/entries", () => ({
  listContours: vi.fn(),
  getEntry: vi.fn(),
  saveEntry: vi.fn(),
}));

vi.mock("../src/audio/decode", () => ({
  decodeToMono22050: vi.fn().mockResolvedValue(new Float32Array(8)),
  TARGET_SAMPLE_RATE: 22_050,
}));

vi.mock("../src/transcribe/basicPitch", () => ({
  warmUpModel: vi.fn().mockResolvedValue(undefined),
  transcribe: vi.fn().mockResolvedValue([]),
}));

const play = vi.fn().mockResolvedValue(undefined);
const stop = vi.fn();
vi.mock("../src/playback/player", () => ({
  getSharedPlayer: () => ({ play, stop, dispose: vi.fn() }),
}));

vi.mock("../src/notation/renderAbc", () => ({
  abcToVisualObj: vi.fn(() => ({ tune: true })),
}));

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

import SearchScreen from "../src/components/SearchScreen";
import { listContours, getEntry, saveEntry } from "../src/db/entries";
import { transcribe } from "../src/transcribe/basicPitch";
import { startRecording } from "../src/audio/recorder";

// A tune whose contour matches the query fragment below.
const TUNE_NOTES: NoteEvent[] = [60, 62, 64, 65, 67, 69].map((p, i) => ({
  pitchMidi: p,
  startSec: i * 0.5,
  durationSec: 0.5,
}));

function tuneEntry(over: Partial<Entry> = {}): Entry {
  return {
    id: "tune-1",
    title: "Rising idea",
    createdAt: 1000,
    updatedAt: 1000,
    audio: new Blob(["x"]),
    audioMimeType: "audio/webm",
    durationSec: 3,
    notes: TUNE_NOTES,
    contour: computeContour(TUNE_NOTES),
    notationAbc: "X:1\nK:C\nCDEFGA\n",
    tags: [],
    schemaVersion: 1,
    ...over,
  };
}

function candidate(): SearchCandidate {
  return { id: "tune-1", title: "Rising idea", contour: computeContour(TUNE_NOTES) };
}

function fakeRecording() {
  return { stop: vi.fn().mockResolvedValue(new Blob(["x"])), cancel: vi.fn() };
}

beforeEach(() => {
  vi.mocked(listContours).mockReset();
  vi.mocked(getEntry).mockReset();
  vi.mocked(transcribe).mockReset().mockResolvedValue([]);
  vi.mocked(startRecording).mockReset().mockResolvedValue(fakeRecording() as never);
  play.mockClear();
  stop.mockClear();
  window.location.hash = "";
  // The "Try an example" path fetches the bundled example; jsdom has no fetch.
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(["x"]),
  }) as unknown as typeof fetch;
});

describe("SearchScreen", () => {
  it("renders the empty-corpus state with a record action when there is nothing to search", async () => {
    vi.mocked(listContours).mockResolvedValue([]);
    render(<SearchScreen />);

    const empty = (await screen.findByText(strings.search.emptyCorpus.title)).closest(
      ".status",
    ) as HTMLElement;
    expect(within(empty).getByText(strings.search.emptyCorpus.body)).toBeInTheDocument();
    const action = within(empty).getByRole("button", {
      name: strings.search.emptyCorpus.action,
    });
    const user = userEvent.setup();
    await user.click(action);
    expect(window.location.hash).toBe("#/");
  });

  it("shows the prompt with a record action and Try an example when the corpus is non-empty", async () => {
    vi.mocked(listContours).mockResolvedValue([candidate()]);
    render(<SearchScreen />);

    expect(
      await screen.findByRole("heading", { name: strings.search.heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record a hum/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings.record.tryExample }),
    ).toBeInTheDocument();
  });

  it("ranks the corpus and renders Closest matches that play and open, never saving the query", async () => {
    vi.mocked(listContours).mockResolvedValue([candidate()]);
    vi.mocked(getEntry).mockResolvedValue(tuneEntry());
    // A genuine fragment of the tune.
    vi.mocked(transcribe).mockResolvedValue(
      [62, 64, 65, 67].map((p, i) => ({ pitchMidi: p, startSec: i * 0.4, durationSec: 0.4 })),
    );
    const user = userEvent.setup();
    render(<SearchScreen />);

    await user.click(await screen.findByRole("button", { name: strings.record.tryExample }));

    expect(
      await screen.findByRole("heading", { name: strings.search.resultsHeading }),
    ).toBeInTheDocument();
    const row = (await screen.findByText("Rising idea")).closest("li")!;

    // Play through the shared player.
    await user.click(within(row).getByRole("button", { name: strings.nav.play }));
    expect(play).toHaveBeenCalledTimes(1);

    // Open the entry (the open button's name includes the title and date).
    await user.click(within(row).getByRole("button", { name: /Rising idea/ }));
    expect(window.location.hash).toBe("#/entry/tune-1");

    // The query hum is never persisted.
    expect(saveEntry).not.toHaveBeenCalled();
  });

  it("renders the no-match state when nothing clears the threshold", async () => {
    vi.mocked(listContours).mockResolvedValue([candidate()]);
    // Full-octave leaps: unrelated to the rising tune, so no match.
    vi.mocked(transcribe).mockResolvedValue(
      [60, 72, 60, 72, 60].map((p, i) => ({ pitchMidi: p, startSec: i * 0.5, durationSec: 0.5 })),
    );
    const user = userEvent.setup();
    render(<SearchScreen />);

    await user.click(await screen.findByRole("button", { name: strings.record.tryExample }));
    expect(await screen.findByText(strings.search.noMatch.title)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings.search.noMatch.action }),
    ).toBeInTheDocument();
  });

  it("renders the no-notes state when transcription finds nothing", async () => {
    vi.mocked(listContours).mockResolvedValue([candidate()]);
    vi.mocked(transcribe).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<SearchScreen />);

    await user.click(await screen.findByRole("button", { name: strings.record.tryExample }));
    expect(await screen.findByText(strings.search.noNotes.title)).toBeInTheDocument();
  });

  it("renders the error state when the pipeline rejects", async () => {
    vi.mocked(listContours).mockResolvedValue([candidate()]);
    vi.mocked(transcribe).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<SearchScreen />);

    await user.click(await screen.findByRole("button", { name: strings.record.tryExample }));
    expect(await screen.findByText(strings.search.error.title)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings.search.error.action }),
    ).toBeInTheDocument();
  });

  it("shows in-place progress while transcribing, never a blank screen", async () => {
    vi.mocked(listContours).mockResolvedValue([candidate()]);
    vi.mocked(transcribe).mockReturnValue(new Promise(() => {}) as never);
    const user = userEvent.setup();
    render(<SearchScreen />);

    await user.click(await screen.findByRole("button", { name: strings.record.tryExample }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(
      new RegExp(`${strings.progress.transcribing}|${strings.progress.warming}`),
    );
  });

  it("renders the error state when the corpus read rejects on mount", async () => {
    vi.mocked(listContours).mockRejectedValue(new Error("db down"));
    render(<SearchScreen />);
    await waitFor(() =>
      expect(screen.getByText(strings.search.error.title)).toBeInTheDocument(),
    );
  });
});
