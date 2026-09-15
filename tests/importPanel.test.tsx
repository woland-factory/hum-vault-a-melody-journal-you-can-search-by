import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { File as NodeFile } from "node:buffer";
import { strings } from "../src/copy/strings";
import type { FileImportItem } from "../src/import/importAudioFiles";

vi.mock("../src/import/importAudioFiles", () => ({
  importAudioFiles: vi.fn(),
}));

import ImportPanel from "../src/components/ImportPanel";
import { importAudioFiles } from "../src/import/importAudioFiles";

function audioFile(name: string): File {
  return new NodeFile([new Uint8Array([1])], name, {
    type: "audio/wav",
  }) as unknown as File;
}

beforeEach(() => {
  vi.mocked(importAudioFiles).mockReset();
});

describe("ImportPanel", () => {
  it("shows the idle prompt with a labeled file input and a drop target", () => {
    render(<ImportPanel />);
    expect(screen.getByText(strings.import.heading)).toBeInTheDocument();
    expect(screen.getByText(strings.import.hint)).toBeInTheDocument();
    const input = screen.getByLabelText(new RegExp(strings.import.choose));
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("multiple");
    expect(screen.getByTestId("import-drop")).toBeInTheDocument();
  });

  it("renders per-file rows immediately and reflects saved/skipped outcomes", async () => {
    vi.mocked(importAudioFiles).mockImplementation(async (files, onUpdate) => {
      const queued: FileImportItem[] = files.map((f) => ({
        name: f.name,
        status: "queued",
        progress: 0,
      }));
      onUpdate(queued);
      const final: FileImportItem[] = [
        { name: files[0].name, status: "saved", progress: 1, entryId: "e1" },
        {
          name: files[1].name,
          status: "skipped",
          progress: 0,
          message: strings.import.skippedType,
        },
      ];
      onUpdate(final);
      return final;
    });

    const user = userEvent.setup();
    render(<ImportPanel />);
    await user.upload(screen.getByTestId("import-files"), [
      audioFile("memo-one.wav"),
      audioFile("memo-two.wav"),
    ]);

    expect(await screen.findByText("memo-one.wav")).toBeInTheDocument();
    expect(screen.getByText("memo-two.wav")).toBeInTheDocument();
    expect(screen.getByText(strings.import.saved)).toBeInTheDocument();
    expect(screen.getByText(strings.import.skippedType)).toBeInTheDocument();
    // Batch summary: one of two added.
    expect(screen.getByText("Added 1 of 2.")).toBeInTheDocument();
  });

  it("shows transcription progress during reading", async () => {
    vi.mocked(importAudioFiles).mockImplementation(async (files, onUpdate) => {
      onUpdate([{ name: files[0].name, status: "reading", progress: 0.4 }]);
      // Keep the batch running so the progress row stays visible.
      await new Promise(() => {});
      return [];
    });

    const user = userEvent.setup();
    render(<ImportPanel />);
    await user.upload(screen.getByTestId("import-files"), audioFile("hum.wav"));

    expect(await screen.findByText(`${strings.import.reading} 40%`)).toBeInTheDocument();
    expect(screen.queryByText(/Added/)).not.toBeInTheDocument();
  });

  it("imports dropped files through the same pipeline", async () => {
    vi.mocked(importAudioFiles).mockResolvedValue([]);
    render(<ImportPanel />);

    const drop = screen.getByTestId("import-drop");
    const file = audioFile("dropped.wav");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.drop(drop, { dataTransfer: { files: [file] } });

    expect(importAudioFiles).toHaveBeenCalledTimes(1);
    expect(vi.mocked(importAudioFiles).mock.calls[0][0][0].name).toBe("dropped.wav");
  });
});
