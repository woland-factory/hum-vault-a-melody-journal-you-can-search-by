import { describe, it, expect } from "vitest";
import { newId } from "../src/util/id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newId", () => {
  it("returns a valid RFC 4122 version 4 UUID string", () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it("does not use crypto.randomUUID, so it works in an insecure context", () => {
    // Simulate plain HTTP (staging): randomUUID is undefined outside a secure
    // context. getRandomValues stays available, so newId must still work.
    const original = crypto.randomUUID;
    delete (crypto as { randomUUID?: unknown }).randomUUID;
    try {
      expect(newId()).toMatch(UUID_V4);
    } finally {
      crypto.randomUUID = original;
    }
  });

  it("produces distinct ids across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(newId());
    expect(seen.size).toBe(1000);
  });
});
