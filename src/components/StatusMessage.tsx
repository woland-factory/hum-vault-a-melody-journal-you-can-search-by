interface StatusMessageProps {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "info" | "error";
}

// A designed surface for empty / error / permission states. Never a raw error
// or a dead end: every one carries a clear next step.
export default function StatusMessage({
  title,
  body,
  actionLabel,
  onAction,
  tone = "info",
}: StatusMessageProps) {
  // An error surface is announced assertively so a screen reader interrupts to
  // read the failure and its next step; info/empty stays polite.
  const isError = tone === "error";
  return (
    <div
      className={`status status--${tone}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <h2 className="status__title">{title}</h2>
      <p className="status__body">{body}</p>
      {actionLabel && onAction && (
        <button type="button" className="btn btn--secondary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
