import { strings } from "../copy/strings";
import { MAX_RECORDING_MS } from "../audio/recorder";

interface RecordButtonProps {
  recording: boolean;
  elapsedMs: number;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

const MAX_SEC = Math.round(MAX_RECORDING_MS / 1000);

// The one primary action. In the recording state it becomes Stop and shows a
// countdown to the 15 s cap.
export default function RecordButton({
  recording,
  elapsedMs,
  disabled,
  onStart,
  onStop,
}: RecordButtonProps) {
  const remaining = Math.max(0, MAX_SEC - Math.floor(elapsedMs / 1000));

  return (
    <div className="record">
      <button
        type="button"
        className={`btn btn--primary record__btn${recording ? " record__btn--recording" : ""}`}
        onClick={recording ? onStop : onStart}
        disabled={disabled}
        aria-label={recording ? strings.record.recording : strings.record.idle}
      >
        <span className="record__dot" aria-hidden="true" />
        {recording ? strings.record.recording : strings.record.idle}
      </button>
      {recording && (
        <p className="record__timer" aria-live="polite">
          {remaining}s
        </p>
      )}
    </div>
  );
}
