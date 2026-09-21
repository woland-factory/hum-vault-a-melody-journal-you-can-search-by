import { useCallback, useEffect, useState } from "react";
import { strings, fill } from "../copy/strings";
import { getStorageEstimate } from "../db/storage";
import { buildVaultZip, downloadVaultZip } from "../export/exportVault";
import { importVaultZip, type VaultImportResult } from "../import/importVault";
import { clearDemoEntries, hasDemoEntries } from "../demo/seedDemo";
import { navigate } from "../router/useHashRoute";
import StatusMessage from "./StatusMessage";

// Settings: storage usage plus the vault's durability surface. Export is the
// screen's one primary action (two taps from the songbook); Import restores a
// backup zip. Everything has designed idle / working / done / error states.

type WorkState = "idle" | "working" | "done" | "error";

interface Storage {
  usageBytes: number | null;
  entryCount: number;
}

function formatBytes(bytes: number): string {
  const mb = 1024 * 1024;
  if (bytes >= 1024 * mb) return `${(bytes / (1024 * mb)).toFixed(1)} GB`;
  if (bytes >= mb) return `${Math.max(1, Math.round(bytes / mb))} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function SettingsScreen() {
  const [storage, setStorage] = useState<Storage | null>(null);
  const [exportState, setExportState] = useState<WorkState>("idle");
  const [exportProgress, setExportProgress] = useState<[number, number] | null>(null);
  const [importState, setImportState] = useState<WorkState>("idle");
  const [importProgress, setImportProgress] = useState<[number, number] | null>(null);
  const [importResult, setImportResult] = useState<VaultImportResult | null>(null);
  const [hasDemo, setHasDemo] = useState(false);
  const [clearState, setClearState] = useState<WorkState>("idle");

  const refreshStorage = useCallback(() => {
    // getStorageEstimate never throws; it degrades to the entry count.
    void getStorageEstimate().then((estimate) =>
      setStorage({ usageBytes: estimate.usageBytes, entryCount: estimate.entryCount }),
    );
  }, []);

  const refreshDemo = useCallback(() => {
    void hasDemoEntries()
      .then(setHasDemo)
      .catch(() => setHasDemo(false));
  }, []);

  useEffect(() => {
    refreshStorage();
    refreshDemo();
  }, [refreshStorage, refreshDemo]);

  const handleClearDemo = useCallback(async () => {
    setClearState("working");
    try {
      await clearDemoEntries();
      setClearState("done");
      refreshStorage();
      refreshDemo();
    } catch {
      // Clearing is a local delete and rarely fails. Return to idle so the
      // control stays available rather than showing raw error text.
      setClearState("idle");
    }
  }, [refreshStorage, refreshDemo]);

  const handleExport = useCallback(async () => {
    setExportState("working");
    setExportProgress(null);
    try {
      const blob = await buildVaultZip((done, total) => setExportProgress([done, total]));
      downloadVaultZip(blob);
      setExportState("done");
    } catch {
      setExportState("error");
    }
  }, []);

  const handleImportFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setImportState("working");
      setImportProgress(null);
      setImportResult(null);
      try {
        const result = await importVaultZip(file, (done, total) =>
          setImportProgress([done, total]),
        );
        setImportResult(result);
        setImportState("done");
        refreshStorage();
      } catch {
        setImportState("error");
      }
    },
    [refreshStorage],
  );

  return (
    <main className="screen">
      <header className="screen__header">
        <button
          type="button"
          className="link detail__back"
          onClick={() => navigate("/songbook")}
        >
          &larr; {strings.nav.songbook}
        </button>
        <h1 className="screen__title">{strings.settings.heading}</h1>
      </header>

      <div className="screen__body">
        <section className="settings__section" aria-label={strings.settings.storageHeading}>
          <h2 className="settings__heading">{strings.settings.storageHeading}</h2>
          {storage === null ? (
            <p className="settings__line settings__line--muted" role="status">
              {strings.settings.storageLoading}
            </p>
          ) : (
            <>
              {storage.usageBytes !== null && (
                <p className="settings__line">
                  {fill(strings.settings.storageUsed, {
                    used: formatBytes(storage.usageBytes),
                  })}
                </p>
              )}
              <p className="settings__line settings__line--muted">
                {storage.entryCount === 1
                  ? strings.settings.entryCountOne
                  : fill(strings.settings.entryCount, { n: storage.entryCount })}
              </p>
            </>
          )}
        </section>

        <section className="settings__section" aria-label={strings.settings.backupHeading}>
          <h2 className="settings__heading">{strings.settings.backupHeading}</h2>
          <p className="settings__line settings__line--muted">
            {strings.settings.backupHint}
          </p>

          {exportState === "error" ? (
            <StatusMessage
              tone="error"
              title={strings.settings.exportError.title}
              body={strings.settings.exportError.body}
              actionLabel={strings.settings.exportError.action}
              onAction={() => void handleExport()}
            />
          ) : (
            <>
              <button
                type="button"
                className="btn btn--primary settings__export"
                onClick={() => void handleExport()}
                disabled={exportState === "working"}
              >
                {exportState === "working"
                  ? exportProgress
                    ? `${strings.settings.exporting} (${exportProgress[0]}/${exportProgress[1]})`
                    : strings.settings.exporting
                  : strings.settings.export}
              </button>
              {exportState === "done" && (
                <p className="settings__line settings__done" role="status">
                  {strings.settings.exportDone}
                </p>
              )}
            </>
          )}

          {importState === "error" ? (
            <StatusMessage
              tone="error"
              title={strings.settings.importError.title}
              body={strings.settings.importError.body}
              actionLabel={strings.settings.importError.action}
              onAction={() => setImportState("idle")}
            />
          ) : (
            <>
              <label className="btn btn--secondary settings__import">
                {importState === "working"
                  ? importProgress
                    ? `${strings.settings.importing} (${importProgress[0]}/${importProgress[1]})`
                    : strings.settings.importing
                  : strings.settings.import}
                <input
                  type="file"
                  className="visually-hidden"
                  data-testid="import-backup"
                  accept=".zip,application/zip"
                  disabled={importState === "working"}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void handleImportFile(file);
                  }}
                />
              </label>
              {importState === "done" && importResult && (
                <p className="settings__line settings__done" role="status">
                  {fill(strings.settings.importDone, {
                    imported: importResult.imported,
                    skipped: importResult.skipped,
                  })}
                  {importResult.failed > 0 &&
                    ` ${fill(strings.settings.importFailedCount, {
                      n: importResult.failed,
                    })}`}
                </p>
              )}
            </>
          )}
        </section>

        {(hasDemo || clearState === "done") && (
          <section className="settings__section" aria-label={strings.demo.heading}>
            <h2 className="settings__heading">{strings.demo.heading}</h2>
            {hasDemo && (
              <>
                <p className="settings__line settings__line--muted">
                  {strings.demo.hint}
                </p>
                <button
                  type="button"
                  className="btn btn--secondary settings__clear-demo"
                  onClick={() => void handleClearDemo()}
                  disabled={clearState === "working"}
                >
                  {clearState === "working"
                    ? strings.demo.clearing
                    : strings.demo.clear}
                </button>
              </>
            )}
            {clearState === "done" && (
              <p className="settings__line settings__done" role="status">
                {strings.demo.cleared}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
