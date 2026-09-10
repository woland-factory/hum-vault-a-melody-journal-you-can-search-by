// Every user-visible string lives here so the copy sweep can scan one place.
// Pre-swept for em-dashes, banned LLM vocabulary, and negative empty-state
// phrasing. If you change a string, re-sweep it (see tests/copy.test.ts).

export const strings = {
  appName: "Hum Vault",
  tagline: "Hum a tune and see it as notation, right on your phone.",
  disclaimer:
    "Your audio stays on this device. The notation is a rough draft of one melody line.",

  record: {
    idle: "Record a hum",
    recording: "Stop",
    tryExample: "Try an example",
  },

  progress: {
    warming: "Getting ready",
    transcribing: "Reading your hum",
  },

  ready: {
    play: "Play",
    playing: "Playing",
    startOver: "Record another",
    heading: "Your draft",
  },

  micDenied: {
    title: "Turn on the microphone",
    body: "Hum Vault listens on this device to turn your hum into notation. Allow microphone access for this site in your browser, then record again.",
    action: "Try again",
  },

  noMic: {
    title: "Connect a microphone",
    body: "Plug in or enable a microphone, then reload to record.",
    action: "Reload",
  },

  emptyResult: {
    title: "Let's try that again",
    body: "Hum one clear note at a time and hold each a beat longer, then record again.",
    action: "Record another",
  },

  transcribeError: {
    title: "Record that again",
    body: "Check your microphone and record again.",
    action: "Record another",
  },

  playbackError: {
    title: "Playback stopped",
    body: "Tap play to start it again.",
    action: "Play",
  },
} as const;

export type Strings = typeof strings;
