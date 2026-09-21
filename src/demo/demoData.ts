// The bundled clips the SEED_DEMO sample songbook plants. Each is a short,
// clearly-pitched hum that transcribes to a real melody. Titles are
// user-visible (swept in tests/copy.test.ts).

export interface DemoClip {
  url: string;
  title: string;
}

// The FIRST clip is the same example the search screen's "Try an example"
// button uses. Seeding it guarantees a deterministic scripted search hit: the
// query and the stored entry come from the identical runtime transcription of
// the identical file, so the entry ranks first. Keep it first.
export const DEMO_CLIPS: DemoClip[] = [
  { url: "/example-hum.wav", title: "Warm-up phrase" },
  { url: "/demo/stairwell.wav", title: "Stairwell tune" },
  { url: "/demo/bridge-idea.wav", title: "Bridge idea" },
];
