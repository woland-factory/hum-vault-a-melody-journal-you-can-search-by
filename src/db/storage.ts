import { countEntries } from "./entries";

// Storage usage for the Settings screen. Never throws: when the estimate API
// is missing or fails, the caller still gets the entry count (and vice versa).

export async function getStorageEstimate(): Promise<{
  usageBytes: number | null;
  quotaBytes: number | null;
  entryCount: number;
}> {
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      usageBytes = typeof estimate.usage === "number" ? estimate.usage : null;
      quotaBytes = typeof estimate.quota === "number" ? estimate.quota : null;
    }
  } catch {
    // Degrade to the entry count alone.
  }

  let entryCount = 0;
  try {
    entryCount = await countEntries();
  } catch {
    // Degrade to zero rather than throwing; the screen still renders.
  }

  return { usageBytes, quotaBytes, entryCount };
}
