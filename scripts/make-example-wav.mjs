// Generates a short, clean monophonic hum used as the "Try an example" sample
// and the e2e fake-audio fixture. Run: node scripts/make-example-wav.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const SR = 44100;
// A simple, clearly-pitched phrase. MIDI -> Hz.
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const phrase = [
  { midi: 60, dur: 0.55 }, // C4
  { midi: 62, dur: 0.55 }, // D4
  { midi: 64, dur: 0.55 }, // E4
  { midi: 67, dur: 0.6 }, // G4
  { midi: 64, dur: 0.55 }, // E4
  { midi: 60, dur: 0.65 }, // C4
];
const gap = 0.08;

const samples = [];
for (const note of phrase) {
  const f = midiToHz(note.midi);
  const n = Math.round(note.dur * SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // Fundamental plus a soft second harmonic, with an attack/release envelope.
    let env = 1;
    const attack = 0.02 * SR;
    const release = 0.05 * SR;
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

// 16-bit PCM mono WAV.
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

mkdirSync("public", { recursive: true });
mkdirSync("tests/fixtures", { recursive: true });
writeFileSync("public/example-hum.wav", buf);
writeFileSync("tests/fixtures/simple-hum.wav", buf);
console.log(`Wrote ${buf.length} bytes, ${samples.length} samples (${(samples.length / SR).toFixed(2)}s)`);
