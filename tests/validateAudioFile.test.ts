import { describe, it, expect } from "vitest";
import { File as NodeFile } from "node:buffer";
import {
  ACCEPTED_AUDIO,
  MAX_IMPORT_BYTES,
  validateAudioFile,
} from "../src/import/validateAudioFile";
import { ValidationError } from "../src/db/entries";
import { strings } from "../src/copy/strings";

function makeFile(name: string, type: string, bytes = 4): File {
  return new NodeFile([new Uint8Array(bytes)], name, { type }) as unknown as File;
}

describe("validateAudioFile", () => {
  it.each(ACCEPTED_AUDIO.mimeTypes.map((t) => [t]))(
    "accepts MIME type %s",
    (type) => {
      expect(() => validateAudioFile(makeFile("memo.dat", type))).not.toThrow();
    },
  );

  it("accepts a .m4a file whose reported type is empty, via its extension", () => {
    expect(() => validateAudioFile(makeFile("voice memo.m4a", ""))).not.toThrow();
  });

  it.each(ACCEPTED_AUDIO.extensions.map((e) => [e]))(
    "accepts extension %s with an empty type",
    (ext) => {
      expect(() => validateAudioFile(makeFile(`memo${ext}`, ""))).not.toThrow();
    },
  );

  it("rejects a file whose type and extension are both unaccepted, with clear copy", () => {
    let thrown: unknown;
    try {
      validateAudioFile(makeFile("notes.txt", "text/plain"));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as Error).message).toBe(strings.import.skippedType);
  });

  it("rejects a file with an empty type and unaccepted extension", () => {
    expect(() => validateAudioFile(makeFile("archive.pdf", ""))).toThrow(
      ValidationError,
    );
  });

  it("rejects a zero-byte file", () => {
    let thrown: unknown;
    try {
      validateAudioFile(makeFile("memo.mp3", "audio/mpeg", 0));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as Error).message).toBe(strings.import.skippedEmptyFile);
  });

  it("rejects a file over the size cap with the size message", () => {
    const file = makeFile("memo.mp3", "audio/mpeg");
    Object.defineProperty(file, "size", { value: MAX_IMPORT_BYTES + 1 });
    let thrown: unknown;
    try {
      validateAudioFile(file);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as Error).message).toBe(strings.import.skippedSize);
  });

  it("accepts a file exactly at the size cap", () => {
    const file = makeFile("memo.mp3", "audio/mpeg");
    Object.defineProperty(file, "size", { value: MAX_IMPORT_BYTES });
    expect(() => validateAudioFile(file)).not.toThrow();
  });

  it("is synchronous, so rejection happens before any decode work", () => {
    // The validator returns void (not a promise): calling it cannot start
    // decode work, and a throw above proves rejection precedes decoding.
    expect(validateAudioFile(makeFile("memo.wav", "audio/wav"))).toBeUndefined();
  });
});
