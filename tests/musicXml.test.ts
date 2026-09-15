import { describe, it, expect } from "vitest";
import { notesToMusicXml } from "../src/export/musicXml";
import type { NoteEvent } from "../src/transcribe/types";

const NOTES: NoteEvent[] = [
  { pitchMidi: 60, startSec: 0, durationSec: 0.5 },
  { pitchMidi: 61, startSec: 0.5, durationSec: 0.25 },
  // A gap before this note becomes a rest.
  { pitchMidi: 67, startSec: 1.25, durationSec: 0.5 },
  { pitchMidi: 72, startSec: 1.75, durationSec: 1.0 },
];

function parse(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  return doc;
}

describe("notesToMusicXml", () => {
  it("emits a well-formed score-partwise document with one pitched note per input note", () => {
    const xml = notesToMusicXml(NOTES, { title: "My idea" });
    const doc = parse(xml);

    expect(doc.documentElement.tagName).toBe("score-partwise");
    expect(doc.querySelector("work-title")?.textContent).toBe("My idea");
    expect(doc.querySelectorAll("pitch").length).toBe(NOTES.length);
    // The gap between notes 2 and 3 is a rest.
    expect(doc.querySelectorAll("rest").length).toBe(1);
    // Grid attributes are declared once.
    expect(doc.querySelector("divisions")?.textContent).toBe("4");
    expect(doc.querySelector("beats")?.textContent).toBe("4");
  });

  it("spells pitches from MIDI numbers with sharps", () => {
    const xml = notesToMusicXml(
      [{ pitchMidi: 61, startSec: 0, durationSec: 0.5 }],
      { title: "t" },
    );
    const doc = parse(xml);
    const pitch = doc.querySelector("pitch")!;
    expect(pitch.querySelector("step")?.textContent).toBe("C");
    expect(pitch.querySelector("alter")?.textContent).toBe("1");
    expect(pitch.querySelector("octave")?.textContent).toBe("4");
  });

  it("is deterministic: identical input yields an identical string", () => {
    const a = notesToMusicXml(NOTES, { title: "Same" });
    const b = notesToMusicXml([...NOTES], { title: "Same" });
    expect(a).toBe(b);
  });

  it("handles an empty notes array as a valid empty score", () => {
    const xml = notesToMusicXml([], { title: "Empty" });
    const doc = parse(xml);
    expect(doc.querySelectorAll("pitch").length).toBe(0);
    expect(doc.querySelectorAll("measure").length).toBe(1);
  });

  it("escapes XML special characters in the title", () => {
    const xml = notesToMusicXml([], { title: `Riff <#2> & "quotes"` });
    const doc = parse(xml);
    expect(doc.querySelector("work-title")?.textContent).toBe(`Riff <#2> & "quotes"`);
  });
});
