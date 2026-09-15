import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { File as NodeFile } from "node:buffer";
import { strings } from "../src/copy/strings";

vi.mock("../src/db/storage", () => ({
  getStorageEstimate: vi.fn(),
}));

vi.mock("../src/export/exportVault", () => ({
  buildVaultZip: vi.fn(),
  downloadVaultZip: vi.fn(),
}));

vi.mock("../src/import/importVault", () => ({
  importVaultZip: vi.fn(),
}));

import SettingsScreen from "../src/components/SettingsScreen";
import { getStorageEstimate } from "../src/db/storage";
import { buildVaultZip, downloadVaultZip } from "../src/export/exportVault";
import { importVaultZip } from "../src/import/importVault";

function backupFile(): File {
  return new NodeFile([new Uint8Array([1, 2, 3])], "backup.zip", {
    type: "application/zip",
  }) as unknown as File;
}

beforeEach(() => {
  vi.mocked(getStorageEstimate)
    .mockReset()
    .mockResolvedValue({ usageBytes: 12 * 1024 * 1024, quotaBytes: null, entryCount: 3 });
  vi.mocked(buildVaultZip)
    .mockReset()
    .mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
  vi.mocked(downloadVaultZip).mockReset();
  vi.mocked(importVaultZip)
    .mockReset()
    .mockResolvedValue({ imported: 2, skipped: 1, failed: 0, total: 3 });
  window.location.hash = "";
});

describe("SettingsScreen", () => {
  it("shows storage usage and the entry count after a loading placeholder", async () => {
    render(<SettingsScreen />);
    // Loading holds the layout with a status line, never a blank region.
    expect(screen.getByText(strings.settings.storageLoading)).toBeInTheDocument();
    expect(await screen.findByText("12 MB used")).toBeInTheDocument();
    expect(screen.getByText("3 ideas saved")).toBeInTheDocument();
  });

  it("degrades to the entry count alone when the estimate API is missing", async () => {
    vi.mocked(getStorageEstimate).mockResolvedValue({
      usageBytes: null,
      quotaBytes: null,
      entryCount: 1,
    });
    render(<SettingsScreen />);
    expect(await screen.findByText(strings.settings.entryCountOne)).toBeInTheDocument();
    expect(screen.queryByText(/used$/)).not.toBeInTheDocument();
  });

  it("exports on tap: builds the zip, triggers the download, and reports done", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.click(screen.getByRole("button", { name: strings.settings.export }));

    expect(await screen.findByText(strings.settings.exportDone)).toBeInTheDocument();
    expect(buildVaultZip).toHaveBeenCalledTimes(1);
    expect(downloadVaultZip).toHaveBeenCalledTimes(1);
  });

  it("shows a designed export error with retry when the build fails", async () => {
    vi.mocked(buildVaultZip)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(new Blob(["zip"]));
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.click(screen.getByRole("button", { name: strings.settings.export }));
    expect(await screen.findByText(strings.settings.exportError.title)).toBeInTheDocument();

    // Retry succeeds.
    await user.click(
      screen.getByRole("button", { name: strings.settings.exportError.action }),
    );
    expect(await screen.findByText(strings.settings.exportDone)).toBeInTheDocument();
  });

  it("imports a chosen zip and shows the restored/skipped summary", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.upload(screen.getByTestId("import-backup"), backupFile());

    expect(await screen.findByText("Restored 2. Skipped 1.")).toBeInTheDocument();
    expect(importVaultZip).toHaveBeenCalledTimes(1);
    // Storage refreshes after a restore.
    expect(getStorageEstimate).toHaveBeenCalledTimes(2);
  });

  it("mentions entries that did not restore", async () => {
    vi.mocked(importVaultZip).mockResolvedValue({
      imported: 1,
      skipped: 0,
      failed: 2,
      total: 3,
    });
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.upload(screen.getByTestId("import-backup"), backupFile());
    expect(await screen.findByText(/2 did not restore\./)).toBeInTheDocument();
  });

  it("shows a designed import error for a bad file, and Try again returns to idle", async () => {
    vi.mocked(importVaultZip).mockRejectedValueOnce(new Error("not a backup"));
    const user = userEvent.setup();
    render(<SettingsScreen />);

    await user.upload(screen.getByTestId("import-backup"), backupFile());
    expect(await screen.findByText(strings.settings.importError.title)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: strings.settings.importError.action }),
    );
    expect(screen.getByText(strings.settings.import)).toBeInTheDocument();
  });

  it("navigates back to the songbook", async () => {
    const user = userEvent.setup();
    render(<SettingsScreen />);
    await user.click(screen.getByRole("button", { name: /Songbook/ }));
    expect(window.location.hash).toBe("#/songbook");
  });
});
