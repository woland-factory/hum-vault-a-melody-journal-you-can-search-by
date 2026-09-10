import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { strings } from "../src/copy/strings";

function flatten(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === "string") out.push(obj);
  else if (obj && typeof obj === "object")
    for (const v of Object.values(obj)) flatten(v, out);
  return out;
}

const BANNED_WORDS = [
  "seamlessly",
  "effortlessly",
  "unlock",
  "elevate",
  "empower",
  "leverage",
  "robust",
  "dive in",
  "in today's fast-paced world",
  "we've got you covered",
];

const NEGATIVE_PATTERNS: RegExp[] = [
  /you don't have/i,
  /\bno\b[^.?!]*\byet\b/i,
  /nothing[^.?!]*here/i,
  /unable to/i,
  /something went wrong/i,
];

function offenders(text: string): string[] {
  const hits: string[] = [];
  if (text.includes("—")) hits.push("em-dash");
  if (text.includes("–")) hits.push("en-dash");
  for (const w of BANNED_WORDS) {
    if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))
      hits.push(`banned word: ${w}`);
  }
  for (const p of NEGATIVE_PATTERNS) if (p.test(text)) hits.push(`negative: ${p}`);
  return hits;
}

describe("copy sweep", () => {
  const uiStrings = flatten(strings);

  it("has the expected user-visible strings to scan", () => {
    expect(uiStrings.length).toBeGreaterThan(10);
  });

  for (const s of flatten(strings)) {
    it(`is clean: "${s.slice(0, 48)}"`, () => {
      expect(offenders(s)).toEqual([]);
    });
  }

  it("keeps the README free of the same tells", () => {
    if (!existsSync("README.md")) return;
    const readme = readFileSync("README.md", "utf8");
    // README is allowed hyphenated compounds; scan only for the real tells.
    const hits: string[] = [];
    if (readme.includes("—")) hits.push("em-dash");
    if (readme.includes("–")) hits.push("en-dash");
    for (const w of BANNED_WORDS)
      if (new RegExp(`\\b${w}\\b`, "i").test(readme)) hits.push(`banned word: ${w}`);
    expect(hits).toEqual([]);
  });

  it("keeps .env.example comments clean", () => {
    if (!existsSync(".env.example")) return;
    const env = readFileSync(".env.example", "utf8");
    expect(env.includes("—")).toBe(false);
    expect(env.includes("–")).toBe(false);
  });
});
