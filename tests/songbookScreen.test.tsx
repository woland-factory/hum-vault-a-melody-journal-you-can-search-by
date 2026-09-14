import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "../src/copy/strings";
import type { Entry } from "../src/db/schema";

vi.mock("../src/db/entries", () => ({
  listEntries: vi.fn(),
}));

const play = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/playback/player", () => ({
  getSharedPlayer: () => ({ play, stop: vi.fn(), dispose: vi.fn() }),
}));

vi.mock("../src/notation/renderAbc", () => ({
  abcToVisualObj: vi.fn(() => ({ tune: true })),
}));

import SongbookScreen from "../src/components/SongbookScreen";
import { listEntries } from "../src/db/entries";

function entry(over: Partial<Entry>): Entry {
  return {
    id: "id",
    title: "Idea",
    createdAt: 1000,
    updatedAt: 1000,
    audio: new Blob(["x"]),
    audioMimeType: "audio/webm",
    durationSec: 1,
    notes: [{ pitchMidi: 60, startSec: 0, durationSec: 0.5 }],
    contour: { version: 1, noteCount: 1, intervals: [], ioiRatios: [] },
    notationAbc: "X:1\nK:C\nC\n",
    tags: [],
    schemaVersion: 1,
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(listEntries).mockReset();
  play.mockClear();
  window.location.hash = "";
});

describe("SongbookScreen", () => {
  it("shows the designed empty state with a record action when there are no entries", async () => {
    vi.mocked(listEntries).mockResolvedValue({ entries: [], nextBefore: null });
    render(<SongbookScreen />);

    const empty = (await screen.findByText(strings.songbookEmpty.title)).closest(
      ".status",
    ) as HTMLElement;
    expect(within(empty).getByText(strings.songbookEmpty.body)).toBeInTheDocument();
    expect(
      within(empty).getByRole("button", { name: strings.songbookEmpty.action }),
    ).toBeInTheDocument();
  });

  it("renders entries newest first as given by the query", async () => {
    vi.mocked(listEntries).mockResolvedValue({
      entries: [
        entry({ id: "b", title: "Newer", createdAt: 2000 }),
        entry({ id: "a", title: "Older", createdAt: 1000 }),
      ],
      nextBefore: null,
    });
    render(<SongbookScreen />);

    const titles = await screen.findAllByText(/Newer|Older/);
    expect(titles.map((t) => t.textContent)).toEqual(["Newer", "Older"]);
  });

  it("plays a row through the shared player", async () => {
    const user = userEvent.setup();
    vi.mocked(listEntries).mockResolvedValue({
      entries: [entry({ id: "a", title: "Tune" })],
      nextBefore: null,
    });
    render(<SongbookScreen />);

    const row = (await screen.findByText("Tune")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: strings.nav.play }));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("shows the Hum to search action as primary when entries exist and navigates to search", async () => {
    const user = userEvent.setup();
    vi.mocked(listEntries).mockResolvedValue({
      entries: [entry({ id: "a", title: "Tune" })],
      nextBefore: null,
    });
    render(<SongbookScreen />);

    const search = await screen.findByRole("button", {
      name: strings.search.fromSongbook,
    });
    expect(search).toHaveClass("btn--primary");
    // Record stays available but subordinate.
    const record = screen.getByRole("button", { name: strings.nav.recordFromSongbook });
    expect(record).not.toHaveClass("btn--primary");

    await user.click(search);
    expect(window.location.hash).toBe("#/search");
  });

  it("shows no search action on an empty songbook", async () => {
    vi.mocked(listEntries).mockResolvedValue({ entries: [], nextBefore: null });
    render(<SongbookScreen />);
    await screen.findByText(strings.songbookEmpty.title);
    expect(
      screen.queryByRole("button", { name: strings.search.fromSongbook }),
    ).not.toBeInTheDocument();
  });

  it("shows a load error state with a reload action when the query rejects", async () => {
    vi.mocked(listEntries).mockRejectedValue(new Error("boom"));
    render(<SongbookScreen />);

    expect(await screen.findByText(strings.songbookError.title)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: strings.songbookError.action }),
    ).toBeInTheDocument();
  });

  it("appends the next page when Show more is tapped and the query stays bounded", async () => {
    const user = userEvent.setup();
    vi.mocked(listEntries)
      .mockResolvedValueOnce({
        entries: [entry({ id: "a", title: "First" })],
        nextBefore: 1000,
      })
      .mockResolvedValueOnce({
        entries: [entry({ id: "b", title: "Second", createdAt: 900 })],
        nextBefore: null,
      });
    render(<SongbookScreen />);

    await screen.findByText("First");
    await user.click(screen.getByRole("button", { name: strings.nav.showMore }));

    await waitFor(() => expect(screen.getByText("Second")).toBeInTheDocument());
    // Second call is bounded by the previous page's cursor and the page limit.
    expect(vi.mocked(listEntries).mock.calls[1][0]).toEqual({ limit: 30, before: 1000 });
    // No more pages, so the control is gone.
    expect(
      screen.queryByRole("button", { name: strings.nav.showMore }),
    ).not.toBeInTheDocument();
  });
});
