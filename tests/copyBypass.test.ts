import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/copy/strings";

// AC6.2: no user-visible string bypasses src/copy/strings.ts. Every rendered
// sentence must come from `strings` (interpolated via `fill`). This scans the
// components for JSX text nodes and human-readable attribute values, and fails
// if any multi-word phrase is a hardcoded literal rather than a `strings`
// reference. Symbols, numbers, units, and single tokens are not user copy and
// are ignored; code comments and non-UI strings are exempt.

const COMPONENT_DIR = join(__dirname, "..", "src", "components");

function componentFiles(): string[] {
  return readdirSync(COMPONENT_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(COMPONENT_DIR, f));
}

// Flatten every string value in `strings` so we can confirm a literal is one of
// them if it ever appears inline.
function flatten(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === "string") out.push(obj);
  else if (obj && typeof obj === "object")
    for (const v of Object.values(obj)) flatten(v, out);
  return out;
}
const KNOWN = new Set(flatten(strings));

// A phrase is "user copy" when it has at least two words made of letters. This
// deliberately ignores className lists (which are lowercase-hyphen tokens),
// single words, symbols, and interpolations.
function looksLikeCopy(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.includes("{")) return false; // an interpolation, not a literal
  const words = trimmed.match(/[A-Za-z][A-Za-z']+/g) ?? [];
  if (words.length < 2) return false;
  // Two capitalized-or-normal words that form a sentence-ish phrase.
  return /[A-Za-z]\s+[A-Za-z]/.test(trimmed);
}

// Pull single-line JSX text nodes: content between ">" and the next "<". The
// character class excludes code punctuation (; = ( ) / | and newlines) so
// TypeScript generics, arrow functions, and statements are not mistaken for
// rendered text. Real hardcoded copy is a run of words, which survives.
function jsxTextNodes(src: string): string[] {
  const nodes: string[] = [];
  const re = />([^<>{}();=/|\n]+)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) nodes.push(m[1]);
  return nodes;
}

// Pull human-facing attribute values written as bare string literals.
function humanAttrLiterals(src: string): string[] {
  const out: string[] = [];
  const re = /\b(aria-label|placeholder|title|alt)\s*=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[2]);
  return out;
}

describe("no user-visible copy bypasses strings.ts (AC6.2)", () => {
  for (const file of componentFiles()) {
    const src = readFileSync(file, "utf8");
    const candidates = [...jsxTextNodes(src), ...humanAttrLiterals(src)].filter(
      looksLikeCopy,
    );
    const bypassing = candidates.filter((text) => !KNOWN.has(text.trim()));

    it(`${file.split("/").pop()} pulls its copy from strings.ts`, () => {
      expect(bypassing).toEqual([]);
    });
  }
});
