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

  nav: {
    songbook: "Songbook",
    recordFromSongbook: "Record a hum",
    showMore: "Show more",
    play: "Play",
  },

  search: {
    fromSongbook: "Hum to search", // the songbook control and the search heading
    heading: "Find a tune by humming",
    intro: "Hum a few notes you remember. Your closest saved ideas come back.",
    resultsHeading: "Closest matches",
    again: "Hum again",
    noMatch: {
      title: "Try a longer hum",
      body: "Hum a few more notes, or hum the part you remember best.",
      action: "Hum again",
    },
    noNotes: {
      title: "Let's try that again",
      body: "Hum one clear note at a time and hold each a beat longer, then hum again.",
      action: "Hum again",
    },
    emptyCorpus: {
      title: "Save an idea first",
      body: "Search looks through your saved hums. Record and save one to begin.",
      action: "Record a hum",
    },
    error: {
      title: "Hum that again",
      body: "Check your microphone and hum again.",
      action: "Hum again",
    },
  },

  save: {
    action: "Save to songbook",
    saving: "Saving",
    saved: "Saved",
    viewInSongbook: "View in songbook",
    // Default entry title, joined with a short date, e.g. "Hum, Sep 11".
    titlePrefix: "Hum,",
  },

  saveError: {
    title: "Try saving again",
    body: "The save could not finish. Try once more.",
    action: "Try again",
  },

  songbookEmpty: {
    title: "Start your songbook",
    body: "Every hum you save lands here, ready to play back. Record your first idea to begin.",
    action: "Record a hum",
  },

  songbookError: {
    title: "Reload to open your songbook",
    body: "The songbook could not open just now. Reload the page to try again.",
    action: "Reload",
  },

  detail: {
    titleLabel: "Title",
    tagsLabel: "Tags",
    addTagPlaceholder: "Add a tag",
    addTagAction: "Add",
    removeTagPrefix: "Remove tag",
    notationHeading: "Draft notation",
    editNotation: "Edit notation",
    saveNotation: "Save",
    notationLabel: "Notation",
    delete: "Delete",
  },

  entryNotFound: {
    title: "Back to the songbook",
    body: "This idea is not in your songbook. It may have been removed.",
    action: "Songbook",
  },

  deleteConfirm: {
    title: "Delete this idea?",
    body: "This removes the recording and its notation from this device. This cannot be undone.",
    confirm: "Delete",
    cancel: "Keep",
  },
} as const;

export type Strings = typeof strings;
