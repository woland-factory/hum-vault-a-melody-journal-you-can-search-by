import { Blob as NodeBlob } from "node:buffer";

// Real browser IndexedDB persists Blob values natively. Under jsdom the global
// Blob is jsdom's, which Node's structuredClone (used by fake-indexeddb) turns
// into an empty object. Node's own Blob round-trips, so use it in tests. This
// polyfill is test-only; the app code is unchanged.
globalThis.Blob = NodeBlob as unknown as typeof Blob;

import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
