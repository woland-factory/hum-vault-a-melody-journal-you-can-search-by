import { isSeedDemoEnabled } from "../config/env";
import { decodeToMono22050, TARGET_SAMPLE_RATE } from "../audio/decode";
import { transcribe, warmUpModel } from "../transcribe/basicPitch";
import { notesToAbc } from "../notation/notesToAbc";
import { saveEntry, openDb } from "../db/entries";
import { getMeta, setMeta, DEMO_SEEDED } from "../db/meta";
import { ENTRY_STORE, type Entry } from "../db/schema";
import { DEMO_CLIPS } from "./demoData";

// The demo seed plants a small sample songbook so a visitor with no microphone
// can hear playback and run a hum-search that returns a real match. It reuses
// the exact capture pipeline the "Try an example" button runs, so there is no
// demo-only search path. Everything happens on the device.

/**
 * Seed the sample songbook once, if SEED_DEMO is on and it has not run before.
 * A no-op otherwise. Fire-and-forget: called after first paint, never awaited
 * before render, and never blocks the shell.
 */
export async function seedDemoIfEnabled(): Promise<void> {
  if (!isSeedDemoEnabled()) return;
  if (await getMeta<boolean>(DEMO_SEEDED)) return;

  // Warm the model through the existing path before transcribing the clips.
  await warmUpModel().catch(() => {});

  for (const clip of DEMO_CLIPS) {
    try {
      const res = await fetch(clip.url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const audio = await decodeToMono22050(blob);
      const notes = await transcribe(audio);
      // Skip a clip that transcribes to nothing rather than saving an empty,
      // unplayable entry.
      if (notes.length === 0) continue;
      await saveEntry({
        audio: blob,
        audioMimeType: blob.type || "audio/wav",
        durationSec: audio.length / TARGET_SAMPLE_RATE,
        notes,
        notationAbc: notesToAbc(notes),
        title: clip.title,
        tags: [],
        isDemo: true,
      });
    } catch {
      // One clip failing to load or decode never stops the rest.
    }
  }

  await setMeta(DEMO_SEEDED, true);
}

/**
 * Delete every demo entry in one cursor pass and return how many were removed.
 * Real entries (no isDemo) are never touched. Not a hot path.
 */
export function clearDemoEntries(): Promise<number> {
  return openDb().then(
    (db) =>
      new Promise<number>((resolve, reject) => {
        const transaction = db.transaction(ENTRY_STORE, "readwrite");
        const store = transaction.objectStore(ENTRY_STORE);
        const cursorReq = store.openCursor();
        let removed = 0;
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          if ((cursor.value as Entry).isDemo) {
            cursor.delete();
            removed += 1;
          }
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
        transaction.oncomplete = () => resolve(removed);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

/** True when at least one demo entry is present (drives the Settings control). */
export function hasDemoEntries(): Promise<boolean> {
  return openDb().then(
    (db) =>
      new Promise<boolean>((resolve, reject) => {
        const transaction = db.transaction(ENTRY_STORE, "readonly");
        const store = transaction.objectStore(ENTRY_STORE);
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) {
            resolve(false);
            return;
          }
          if ((cursor.value as Entry).isDemo) {
            resolve(true);
            return;
          }
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      }),
  );
}
