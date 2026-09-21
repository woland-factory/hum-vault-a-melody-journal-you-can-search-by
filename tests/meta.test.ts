import { describe, it, expect, beforeEach } from "vitest";
import {
  getMeta,
  setMeta,
  FIRST_RUN_COMPLETE,
  DEMO_SEEDED,
} from "../src/db/meta";
import { saveEntry, getEntry, openDb, listEntries, deleteEntry } from "../src/db/entries";
import { ENTRY_STORE, META_STORE } from "../src/db/schema";
import type { NoteEvent } from "../src/transcribe/types";

const notes: NoteEvent[] = [
  { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
  { pitchMidi: 64, startSec: 0.5, durationSec: 0.5 },
];

function makeInput() {
  return {
    audio: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }),
    audioMimeType: "audio/webm",
    durationSec: 1,
    notes,
    notationAbc: "X:1\nK:C\nCE\n",
    title: "My idea",
    tags: [],
  };
}

// Clear both stores through the public API and a meta cursor so each test starts
// from a known state.
async function clearAll() {
  const { entries } = await listEntries({ limit: 10_000 });
  for (const e of entries) await deleteEntry(e.id);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

beforeEach(clearAll);

describe("meta store", () => {
  it("round-trips a boolean flag", async () => {
    await setMeta(FIRST_RUN_COMPLETE, true);
    expect(await getMeta<boolean>(FIRST_RUN_COMPLETE)).toBe(true);

    await setMeta(DEMO_SEEDED, true);
    expect(await getMeta<boolean>(DEMO_SEEDED)).toBe(true);

    // A later write replaces the value under the same key.
    await setMeta(FIRST_RUN_COMPLETE, false);
    expect(await getMeta<boolean>(FIRST_RUN_COMPLETE)).toBe(false);
  });

  it("resolves undefined for an unset key without throwing", async () => {
    expect(await getMeta("never-set")).toBeUndefined();
  });

  it("opens at version 2 with both stores and leaves entries readable", async () => {
    // A forward-only migration: saving an entry opens the v2 database, which
    // adds the meta store while leaving the entries store and its record intact.
    const saved = await saveEntry(makeInput());

    const db = await openDb();
    const stores = Array.from(db.objectStoreNames);
    expect(stores).toContain(ENTRY_STORE);
    expect(stores).toContain(META_STORE);
    expect(db.version).toBe(2);

    const got = await getEntry(saved.id);
    expect(got).toBeDefined();
    expect(got!.title).toBe("My idea");
  });
});
