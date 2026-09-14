import type { NoteEvent } from "../transcribe/types";
import { computeContour } from "../melody/contour";
import {
  CREATED_AT_INDEX,
  DB_NAME,
  DB_VERSION,
  ENTRY_SCHEMA_VERSION,
  ENTRY_STORE,
  type Entry,
  type SearchCandidate,
} from "./schema";

// A thin, typed, promise-based wrapper over the native IndexedDB API. The
// connection is opened once and cached at module level. Every listing goes
// through the byCreatedAt index so no query scans the whole store unsorted.

const DEFAULT_PAGE_SIZE = 30;

// Safety backstop for the one deliberately unbounded read (listContours). Far
// above any realistic hand-hummed corpus; a later EPIC can revisit if real
// vaults approach it.
const MAX_SEARCH_CORPUS = 2000;

// Boundary validation limits (QUALITY BAR §5). Everything is local, but input
// is still validated at this boundary.
const MAX_TITLE_LEN = 120;
const MAX_NOTATION_LEN = 20_000;
const MAX_TAGS = 20;
const MAX_TAG_LEN = 30;

/** Thrown when input fails boundary validation. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      dbPromise = null;
      reject(wrapError(err));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENTRY_STORE)) {
        const store = db.createObjectStore(ENTRY_STORE, { keyPath: "id" });
        store.createIndex(CREATED_AT_INDEX, "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(wrapError(request.error));
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error("The songbook database is busy. Close other tabs and try again."));
    };
  });
  return dbPromise;
}

// Wrap raw IndexedDB errors so callers get a rejected promise they can turn
// into a designed state (QuotaExceededError included) rather than a crash.
function wrapError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error("The songbook could not be reached.");
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): { store: IDBObjectStore; done: Promise<void> } {
  const transaction = db.transaction(ENTRY_STORE, mode);
  const store = transaction.objectStore(ENTRY_STORE);
  const done = new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(wrapError(transaction.error));
    transaction.onabort = () => reject(wrapError(transaction.error));
  });
  return { store, done };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(wrapError(request.error));
  });
}

function validateTitle(title: string): string {
  if (typeof title !== "string" || title.length > MAX_TITLE_LEN) {
    throw new ValidationError("Title is too long.");
  }
  return title;
}

function validateNotation(notationAbc: string): string {
  if (typeof notationAbc !== "string" || notationAbc.length > MAX_NOTATION_LEN) {
    throw new ValidationError("Notation is too long.");
  }
  return notationAbc;
}

// Trim tags, drop empties and duplicates, and enforce the count/length limits.
function normalizeTags(tags: string[]): string[] {
  if (!Array.isArray(tags)) throw new ValidationError("Tags must be a list.");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    if (typeof raw !== "string") throw new ValidationError("Each tag must be text.");
    const tag = raw.trim();
    if (tag.length === 0) throw new ValidationError("A tag cannot be blank.");
    if (tag.length > MAX_TAG_LEN) throw new ValidationError("A tag is too long.");
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  if (out.length > MAX_TAGS) throw new ValidationError("Too many tags.");
  return out;
}

export function saveEntry(input: {
  audio: Blob;
  audioMimeType: string;
  durationSec: number;
  notes: NoteEvent[];
  notationAbc: string;
  title: string;
  tags: string[];
}): Promise<Entry> {
  // Validate at the boundary before touching the database.
  let entry: Entry;
  try {
    const title = validateTitle(input.title);
    const notationAbc = validateNotation(input.notationAbc);
    const tags = normalizeTags(input.tags);
    const now = Date.now();
    // computeContour runs here so "contour is derived from notes" is enforced
    // in one place and cannot drift from what callers pass.
    entry = {
      id: crypto.randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      audio: input.audio,
      audioMimeType: input.audioMimeType,
      durationSec: input.durationSec,
      notes: input.notes,
      contour: computeContour(input.notes),
      notationAbc,
      tags,
      schemaVersion: ENTRY_SCHEMA_VERSION,
    };
  } catch (err) {
    return Promise.reject(err);
  }

  return openDb().then((db) => {
    const { store, done } = tx(db, "readwrite");
    store.put(entry);
    return done.then(() => entry);
  });
}

export function getEntry(id: string): Promise<Entry | undefined> {
  return openDb().then((db) => {
    const { store, done } = tx(db, "readonly");
    const req = requestToPromise(store.get(id));
    return done.then(() => req);
  });
}

export function listEntries(opts?: {
  limit?: number;
  before?: number;
}): Promise<{ entries: Entry[]; nextBefore: number | null }> {
  const limit = Math.max(1, opts?.limit ?? DEFAULT_PAGE_SIZE);
  const before = opts?.before;

  return openDb().then((db) => {
    const { store, done } = tx(db, "readonly");
    const index = store.index(CREATED_AT_INDEX);
    // When paging, bound the range so it continues strictly before the last
    // row of the previous page. createdAt from Date.now() is effectively
    // unique at human save rates, so sub-millisecond ties are not a concern.
    const range =
      before !== undefined ? IDBKeyRange.upperBound(before, true) : undefined;
    // A descending ("prev") cursor yields newest first.
    const cursorReq = index.openCursor(range, "prev");
    const entries: Entry[] = [];

    return new Promise<{ entries: Entry[]; nextBefore: number | null }>(
      (resolve, reject) => {
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && entries.length < limit) {
            entries.push(cursor.value as Entry);
            cursor.continue();
            return;
          }
          // A full page means more may exist; page from the last row's key.
          const nextBefore =
            entries.length === limit ? entries[entries.length - 1].createdAt : null;
          done
            .then(() => resolve({ entries, nextBefore }))
            .catch(reject);
        };
        cursorReq.onerror = () => reject(wrapError(cursorReq.error));
      },
    );
  });
}

export function updateEntry(
  id: string,
  patch: Partial<Pick<Entry, "title" | "tags" | "notationAbc">>,
): Promise<Entry> {
  // Validate and normalize the patch at the boundary, before opening a
  // transaction. notes and contour are immutable in this EPIC, so editing
  // notation never changes the search index (see the notation/notes boundary
  // in the EPIC spec).
  let clean: Partial<Pick<Entry, "title" | "tags" | "notationAbc">>;
  try {
    clean = {};
    if (patch.title !== undefined) clean.title = validateTitle(patch.title);
    if (patch.notationAbc !== undefined)
      clean.notationAbc = validateNotation(patch.notationAbc);
    if (patch.tags !== undefined) clean.tags = normalizeTags(patch.tags);
  } catch (err) {
    return Promise.reject(err);
  }

  return openDb().then(
    (db) =>
      new Promise<Entry>((resolve, reject) => {
        const transaction = db.transaction(ENTRY_STORE, "readwrite");
        const store = transaction.objectStore(ENTRY_STORE);
        const getReq = store.get(id);
        let next: Entry | null = null;
        getReq.onsuccess = () => {
          const existing = getReq.result as Entry | undefined;
          if (!existing) {
            reject(new ValidationError("That idea is no longer in your songbook."));
            return;
          }
          next = { ...existing, ...clean, updatedAt: Date.now() };
          // Issued synchronously within the get success callback so the
          // transaction stays active for the read-modify-write.
          store.put(next);
        };
        getReq.onerror = () => reject(wrapError(getReq.error));
        transaction.oncomplete = () => {
          if (next) resolve(next);
        };
        transaction.onerror = () => reject(wrapError(transaction.error));
        transaction.onabort = () => reject(wrapError(transaction.error));
      }),
  );
}

export function deleteEntry(id: string): Promise<void> {
  return openDb().then((db) => {
    const { store, done } = tx(db, "readwrite");
    store.delete(id);
    return done;
  });
}

// Cursor the whole entries store (newest first via the byCreatedAt index) and
// return only { id, title, contour } per entry: no audio blob, no notes, so
// scanning the corpus for a melodic match is cheap. This is the app's one
// deliberately unbounded read, and it is correct by design: search must see
// every entry or it would silently fail to recall old ideas. Each row is tiny
// (a few number arrays), so match cost is O(sum of contour lengths). Stops
// after MAX_SEARCH_CORPUS rows and logs a count only (never titles, notes, or
// contours) if the store is larger.
export function listContours(): Promise<SearchCandidate[]> {
  return openDb().then((db) => {
    const { store, done } = tx(db, "readonly");
    const index = store.index(CREATED_AT_INDEX);
    const cursorReq = index.openCursor(undefined, "prev");
    const candidates: SearchCandidate[] = [];

    return new Promise<SearchCandidate[]>((resolve, reject) => {
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && candidates.length < MAX_SEARCH_CORPUS) {
          const entry = cursor.value as Entry;
          candidates.push({ id: entry.id, title: entry.title, contour: entry.contour });
          cursor.continue();
          return;
        }
        if (cursor) {
          // The store is larger than the backstop; report the count only.
          console.info(`Search scanned ${candidates.length} entries (corpus is larger).`);
        }
        done.then(() => resolve(candidates)).catch(reject);
      };
      cursorReq.onerror = () => reject(wrapError(cursorReq.error));
    });
  });
}

export function countEntries(): Promise<number> {
  return openDb().then((db) => {
    const { store, done } = tx(db, "readonly");
    const req = requestToPromise(store.count());
    return done.then(() => req);
  });
}
