import { openDb } from "./entries";
import { META_STORE } from "./schema";

// Thin, typed, promise-based wrappers over the `meta` object store. This holds
// a handful of small app flags (first-run and demo-seed state), not user data.
// It reuses the single cached connection from entries.ts so the app never opens
// a second connection to the same database.

export const FIRST_RUN_COMPLETE = "firstRunComplete";
export const DEMO_SEEDED = "demoSeeded";

interface MetaRecord {
  key: string;
  value: unknown;
}

/** Read a flag. Resolves undefined for an unset key; never throws on a miss. */
export function getMeta<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = db.transaction(META_STORE, "readonly");
        const request = transaction.objectStore(META_STORE).get(key);
        request.onsuccess = () => {
          const record = request.result as MetaRecord | undefined;
          resolve(record === undefined ? undefined : (record.value as T));
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

/** Write a flag under its key, replacing any prior value. */
export function setMeta(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(META_STORE, "readwrite");
        transaction.objectStore(META_STORE).put({ key, value });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}
