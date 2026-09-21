import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { strings } from "../src/copy/strings";
import type { Entry } from "../src/db/schema";

vi.mock("abcjs", () => ({
  default: { renderAbc: vi.fn(() => [{ tune: true }]) },
}));

vi.mock("../src/db/entries", () => ({
  getEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));

vi.mock("../src/playback/player", () => ({
  getSharedPlayer: () => ({ play: vi.fn().mockResolvedValue(undefined), stop: vi.fn(), dispose: vi.fn() }),
}));

import EntryDetailScreen from "../src/components/EntryDetailScreen";
import { getEntry, updateEntry, deleteEntry } from "../src/db/entries";

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    title: "First idea",
    createdAt: 1000,
    updatedAt: 1000,
    audio: new Blob(["x"]),
    audioMimeType: "audio/webm",
    durationSec: 1,
    notes: [
      { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
      { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
    ],
    contour: { version: 1, noteCount: 2, intervals: [4], ioiRatios: [] },
    notationAbc: "X:1\nK:C\nCE\n",
    tags: ["draft"],
    schemaVersion: 1,
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(getEntry).mockReset();
  vi.mocked(updateEntry).mockReset();
  vi.mocked(deleteEntry).mockReset();
});

describe("EntryDetailScreen", () => {
  it("renames the entry, persisting only the title", async () => {
    const user = userEvent.setup();
    const e = entry();
    vi.mocked(getEntry).mockResolvedValue(e);
    vi.mocked(updateEntry).mockResolvedValue({ ...e, title: "Renamed" });
    render(<EntryDetailScreen id="e1" />);

    const input = await screen.findByLabelText(strings.detail.titleLabel);
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.tab(); // blur

    await waitFor(() => expect(updateEntry).toHaveBeenCalledWith("e1", { title: "Renamed" }));
  });

  it("adds and removes a tag, persisting the tag list", async () => {
    const user = userEvent.setup();
    const e = entry({ tags: [] });
    vi.mocked(getEntry).mockResolvedValue(e);
    vi.mocked(updateEntry).mockImplementation(
      async (_id, patch) => ({ ...e, ...patch }) as Entry,
    );
    render(<EntryDetailScreen id="e1" />);

    const tagInput = await screen.findByLabelText(strings.detail.addTagPlaceholder);
    await user.type(tagInput, "jazz");
    await user.click(screen.getByRole("button", { name: strings.detail.addTagAction }));
    await waitFor(() => expect(updateEntry).toHaveBeenCalledWith("e1", { tags: ["jazz"] }));

    await user.click(
      await screen.findByRole("button", {
        name: `${strings.detail.removeTagPrefix} jazz`,
      }),
    );
    await waitFor(() =>
      expect(updateEntry).toHaveBeenLastCalledWith("e1", { tags: [] }),
    );
  });

  it("edits the draft notation, persisting notationAbc without touching notes", async () => {
    const user = userEvent.setup();
    const e = entry();
    vi.mocked(getEntry).mockResolvedValue(e);
    vi.mocked(updateEntry).mockImplementation(
      async (_id, patch) => ({ ...e, ...patch }) as Entry,
    );
    render(<EntryDetailScreen id="e1" />);

    await user.click(await screen.findByRole("button", { name: strings.detail.editNotation }));
    const textarea = screen.getByLabelText(strings.detail.notationLabel);
    await user.clear(textarea);
    await user.type(textarea, "X:1\nK:G\nGAB\n");
    await user.click(screen.getByRole("button", { name: strings.detail.saveNotation }));

    await waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1));
    const patch = vi.mocked(updateEntry).mock.calls[0][1];
    expect(patch).toHaveProperty("notationAbc");
    expect(patch).not.toHaveProperty("notes");
    expect(patch).not.toHaveProperty("contour");
  });

  it("deletes behind a confirm dialog and returns to the songbook", async () => {
    const user = userEvent.setup();
    vi.mocked(getEntry).mockResolvedValue(entry());
    vi.mocked(deleteEntry).mockResolvedValue(undefined);
    window.location.hash = "#/entry/e1";
    render(<EntryDetailScreen id="e1" />);

    await user.click(await screen.findByRole("button", { name: strings.detail.delete }));

    // An accessible modal confirm appears.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText(strings.deleteConfirm.title)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: strings.deleteConfirm.confirm }));

    await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith("e1"));
    await waitFor(() => expect(window.location.hash).toBe("#/songbook"));
  });

  it("dismisses the delete dialog on Escape without deleting", async () => {
    const user = userEvent.setup();
    vi.mocked(getEntry).mockResolvedValue(entry());
    render(<EntryDetailScreen id="e1" />);

    await user.click(await screen.findByRole("button", { name: strings.detail.delete }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("shows the not-found state for a missing entry", async () => {
    vi.mocked(getEntry).mockResolvedValue(undefined);
    render(<EntryDetailScreen id="missing" />);

    expect(await screen.findByText(strings.entryNotFound.title)).toBeInTheDocument();
    expect(screen.getByText(strings.entryNotFound.body)).toBeInTheDocument();
  });

  it("labels the tag editor as a semantic group (AC5.5)", async () => {
    vi.mocked(getEntry).mockResolvedValue(entry());
    render(<EntryDetailScreen id="e1" />);
    await screen.findByLabelText(strings.detail.titleLabel);
    const group = screen.getByRole("group", { name: strings.detail.tagsLabel });
    expect(group).toBeInTheDocument();
  });

  it("exposes exactly one screen-level h1 (AC5.1)", async () => {
    vi.mocked(getEntry).mockResolvedValue(entry());
    render(<EntryDetailScreen id="e1" />);
    await screen.findByLabelText(strings.detail.titleLabel);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(strings.detail.heading);
  });

  it("keeps one h1 even in the not-found phase (AC5.1)", async () => {
    vi.mocked(getEntry).mockResolvedValue(undefined);
    render(<EntryDetailScreen id="missing" />);
    await screen.findByText(strings.entryNotFound.title);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("disables Save notation while the write is pending (AC2.1)", async () => {
    const user = userEvent.setup();
    vi.mocked(getEntry).mockResolvedValue(entry());
    vi.mocked(updateEntry).mockReturnValue(new Promise(() => {}) as never);
    render(<EntryDetailScreen id="e1" />);

    await user.click(await screen.findByRole("button", { name: strings.detail.editNotation }));
    const textarea = screen.getByLabelText(strings.detail.notationLabel);
    await user.clear(textarea);
    await user.type(textarea, "X:1\nK:G\nGAB\n");
    await user.click(screen.getByRole("button", { name: strings.detail.saveNotation }));

    expect(screen.getByRole("button", { name: strings.save.saving })).toBeDisabled();
  });

  it("disables Add tag while the write is pending (AC2.1)", async () => {
    const user = userEvent.setup();
    vi.mocked(getEntry).mockResolvedValue(entry({ tags: [] }));
    vi.mocked(updateEntry).mockReturnValue(new Promise(() => {}) as never);
    render(<EntryDetailScreen id="e1" />);

    const tagInput = await screen.findByLabelText(strings.detail.addTagPlaceholder);
    await user.type(tagInput, "jazz");
    await user.click(screen.getByRole("button", { name: strings.detail.addTagAction }));

    expect(screen.getByRole("button", { name: strings.detail.addTagAction })).toBeDisabled();
  });
});
