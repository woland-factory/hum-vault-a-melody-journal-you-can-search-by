// Generates the extra demo clips used by the SEED_DEMO sample songbook.
// Same offline synthesis as scripts/make-example-wav.mjs: a sine fundamental
// plus a soft second harmonic and an attack/release envelope. No runtime code
// path. Run: node scripts/make-demo-audio.mjs
//
// The first demo clip is the bundled /example-hum.wav (produced by
// make-example-wav.mjs), so it is not regenerated here. These are the others.
import { writeFileSync, mkdirSync } from "node:fs";

const SR = 44100;
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const gap = 0.08;

// Two short, distinct, clearly-pitched phrases in a comfortable hum range.
const clips = [
  {
    file: "public/demo/stairwell.wav",
    // Steps up and back down, like climbing a stairwell.
    phrase: [
      { midi: 60, dur: 0.5 }, // C4
      { midi: 62, dur: 0.5 }, // D4
      { midi: 64, dur: 0.5 }, // E4
      { midi: 65, dur: 0.55 }, // F4
      { midi: 64, dur: 0.5 }, // E4
      { midi: 62, dur: 0.55 }, // D4
    ],
  },
  {
    file: "public/demo/bridge-idea.wav",
    // A wider, leaning shape for contrast.
    phrase: [
      { midi: 67, dur: 0.5 }, // G4
      { midi: 69, dur: 0.5 }, // A4
      { midi: 71, dur: 0.55 }, // B4
      { midi: 67, dur: 0.5 }, // G4
      { midi: 65, dur: 0.6 }, // F4
    ],
  },
];

function synth(phrase) {
  const samples = [];
  for (const note of phrase) {
    const f = midiToHz(note.midi);
    const n = Math.round(note.dur * SR);
    const attack = 0.02 * SR;
    const release = 0.05 * SR;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let env = 1;
      if (i < attack) env = i / attack;
      else if (i > n - release) env = Math.max(0, (n - i) / release);
      const s =
        0.6 * Math.sin(2 * Math.PI * f * t) +
        0.2 * Math.sin(2 * Math.PI * 2 * f * t);
      samples.push(env * s * 0.6);
    }
    const g = Math.round(gap * SR);
    for (let i = 0; i < g; i++) samples.push(0);
  }
  return samples;
}

function toWav(samples) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

mkdirSync("public/demo", { recursive: true });
for (const clip of clips) {
  const buf = toWav(synth(clip.phrase));
  writeFileSync(clip.file, buf);
  console.log(`Wrote ${clip.file}: ${buf.length} bytes`);
}
