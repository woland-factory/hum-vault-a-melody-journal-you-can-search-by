import { useCallback, useRef, useState } from "react";
import { strings, fill } from "../copy/strings";
import {
  importAudioFiles,
  type FileImportItem,
} from "../import/importAudioFiles";

// The bulk-import affordance on the idle capture screen: a labeled file input
// (the mobile baseline) inside a drop target (the desktop enhancement), with a
// per-file progress list. Rows appear immediately on drop/choose; recording
// stays the screen's primary action.

const ACCEPT = "audio/*,.mp3,.m4a,.mp4,.aac,.wav,.webm,.ogg,.flac";

function statusLabel(item: FileImportItem): string {
  switch (item.status) {
    case "queued":
      return strings.import.queued;
    case "decoding":
      return strings.import.decoding;
    case "reading":
      return `${strings.import.reading} ${Math.round(item.progress * 100)}%`;
    case "saved":
      return strings.import.saved;
    default:
      // Skipped and failed rows explain themselves through their message.
      return "";
  }
}

export default function ImportPanel() {
  const [items, setItems] = useState<FileImportItem[] | null>(null);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const runningRef = useRef(false);

  const start = useCallback(async (files: File[]) => {
    if (files.length === 0 || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    try {
      await importAudioFiles(files, setItems);
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, []);

  const handleChoose = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      // Allow re-choosing the same files later.
      event.target.value = "";
      void start(files);
    },
    [start],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      void start(Array.from(event.dataTransfer?.files ?? []));
    },
    [start],
  );

  const savedCount = items?.filter((item) => item.status === "saved").length ?? 0;

  return (
    <section className="import" aria-label={strings.import.heading}>
      <h2 className="import__heading">{strings.import.heading}</h2>
      <div
        className={`import__drop${dragOver ? " import__drop--over" : ""}`}
        data-testid="import-drop"
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <p className="import__hint">{strings.import.hint}</p>
        <label className="btn btn--secondary import__choose">
          {strings.import.choose}
          <input
            type="file"
            className="visually-hidden"
            data-testid="import-files"
            multiple
            accept={ACCEPT}
            disabled={running}
            onChange={handleChoose}
          />
        </label>
      </div>

      {items && (
        <ul className="import__list" aria-live="polite">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="import__row">
              <div className="import__row-top">
                <span className="import__name">{item.name}</span>
                <span className={`import__status import__status--${item.status}`}>
                  {statusLabel(item)}
                </span>
              </div>
              {item.message && <p className="import__message">{item.message}</p>}
            </li>
          ))}
        </ul>
      )}

      {items && !running && (
        <p className="import__summary" role="status">
          {fill(strings.import.batchDone, { n: savedCount, total: items.length })}
        </p>
      )}
    </section>
  );
}
