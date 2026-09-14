// Short, readable date for a songbook entry, e.g. "Sep 11" this year or
// "Sep 11, 2025" in an earlier year. Uses the browser locale.
export function formatEntryDate(epochMs: number, now: number = Date.now()): string {
  const date = new Date(epochMs);
  const sameYear = new Date(now).getFullYear() === date.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
