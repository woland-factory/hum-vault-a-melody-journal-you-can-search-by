import { useCallback, useEffect, useRef, useState } from "react";
import { strings } from "../copy/strings";
import {
  startRecording,
  RecorderError,
  MAX_RECORDING_MS,
  type Recording,
} from "../audio/recorder";
import { decodeToMono22050, TARGET_SAMPLE_RATE } from "../audio/decode";
import { transcribe, warmUpModel } from "../transcribe/basicPitch";
import type { NoteEvent } from "../transcribe/types";
import { notesToAbc } from "../notation/notesToAbc";
import { estimateMelodyMs } from "../melody/duration";
import { getSharedPlayer, type VisualObj } from "../playback/player";
import { saveEntry, countEntries } from "../db/entries";
import { SEED_COMPLETE_EVENT } from "../demo/seedDemo";
import { navigate } from "../router/useHashRoute";
import RecordButton from "./RecordButton";
import NotationView from "./NotationView";
import StatusMessage from "./StatusMessage";
import ImportPanel from "./ImportPanel";
import Walkthrough from "./Walkthrough";
import { useOnboarding } from "../onboarding/OnboardingContext";

type SaveState = "idle" | "saving" | "saved" | "error";

function defaultTitle(): string {
  const date = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${strings.save.titlePrefix} ${date}`;
}

type Phase =
  | "idle"
  | "requesting-mic"
  | "recording"
  | "transcribing"
  | "ready"
  | "mic-denied"
  | "no-mic"
  | "empty-result"
  | "error";

const EXAMPLE_URL = "/example-hum.wav";

export default function CaptureScreen() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [abc, setAbc] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [entryCount, setEntryCount] = useState<number | null>(null);
  const { markDraftReady, markSaved } = useOnboarding();

  const recordingRef = useRef<Recording | null>(null);
  const visualObjRef = useRef<VisualObj | null>(null);
  // Retained from the pipeline so a ready result can be saved as an Entry.
  const sourceBlobRef = useRef<Blob | null>(null);
  const notesRef = useRef<NoteEvent[]>([]);
  const durationSecRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const melodyMsRef = useRef(0);
  const finishingRef = useRef(false);

  // Warm the model in the background after first paint. This never blocks the
  // shell from rendering.
  useEffect(() => {
    void warmUpModel()
      .then(() => setModelReady(true))
      .catch(() => {
        /* transcription will surface its own error if it is actually used */
      });
  }, []);

  // Advance the guide as the draft appears and as a save succeeds. These read
  // from the phase/saveState the screen already tracks, so the guide follows
  // whether the draft came from a recording or the example.
  useEffect(() => {
    if (phase === "ready") markDraftReady();
  }, [phase, markDraftReady]);

  useEffect(() => {
    if (saveState === "saved") markSaved();
  }, [saveState, markSaved]);

  // Show how many ideas are already saved so the Songbook link is meaningful.
  // Refreshes whenever we return to the idle screen or finish a save.
  useEffect(() => {
    if (phase !== "idle" && saveState !== "saved") return;
    let active = true;
    void countEntries()
      .then((n) => {
        if (active) setEntryCount(n);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [phase, saveState]);

  // The demo seed runs after first paint, so the count read at mount can miss
  // the seeded ideas. Re-read once the seed settles so a cold visitor sees the
  // Songbook link without reloading.
  useEffect(() => {
    function refresh() {
      void countEntries()
        .then((n) => setEntryCount(n))
        .catch(() => {});
    }
    window.addEventListener(SEED_COMPLETE_EVENT, refresh);
    return () => window.removeEventListener(SEED_COMPLETE_EVENT, refresh);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (playResetRef.current) clearTimeout(playResetRef.current);
      recordingRef.current?.cancel();
      // The shared player is reused across screens, so stop it rather than
      // disposing it on unmount.
      getSharedPlayer().stop();
    };
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    setElapsedMs(0);
    const startedAt = Date.now();
    stopTimer();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 200);
  }, [stopTimer]);

  const runPipeline = useCallback(async (loadAudio: () => Promise<Blob>) => {
    setPhase("transcribing");
    try {
      const blob = await loadAudio();
      const audio = await decodeToMono22050(blob);
      const notes = await transcribe(audio);
      setModelReady(true);
      if (notes.length === 0) {
        setPhase("empty-result");
        return;
      }
      melodyMsRef.current = estimateMelodyMs(notes);
      // Retain the source audio and notes so the ready result can be saved.
      sourceBlobRef.current = blob;
      notesRef.current = notes;
      durationSecRef.current = audio.length / TARGET_SAMPLE_RATE;
      setSaveState("idle");
      setAbc(notesToAbc(notes));
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, []);

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    stopTimer();
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) {
      finishingRef.current = false;
      return;
    }
    await runPipeline(() => rec.stop());
    finishingRef.current = false;
  }, [runPipeline, stopTimer]);

  const handleRecord = useCallback(async () => {
    setPlaybackError(false);
    setAbc(null);
    setPhase("requesting-mic");
    void warmUpModel()
      .then(() => setModelReady(true))
      .catch(() => {});
    try {
      const rec = await startRecording({
        maxMs: MAX_RECORDING_MS,
        onAutoStop: () => {
          void finishRecording();
        },
      });
      recordingRef.current = rec;
      finishingRef.current = false;
      setPhase("recording");
      startTimer();
    } catch (err) {
      stopTimer();
      if (err instanceof RecorderError) {
        setPhase(err.kind);
      } else {
        setPhase("error");
      }
    }
  }, [finishRecording, startTimer, stopTimer]);

  const handleExample = useCallback(() => {
    setPlaybackError(false);
    setAbc(null);
    void warmUpModel()
      .then(() => setModelReady(true))
      .catch(() => {});
    void runPipeline(async () => {
      const res = await fetch(EXAMPLE_URL);
      if (!res.ok) throw new Error("Could not load the example.");
      return res.blob();
    });
  }, [runPipeline]);

  const handlePlay = useCallback(async () => {
    if (!visualObjRef.current) return;
    setPlaybackError(false);
    setPlaying(true);
    if (playResetRef.current) clearTimeout(playResetRef.current);
    playResetRef.current = setTimeout(
      () => setPlaying(false),
      Math.max(1200, melodyMsRef.current),
    );
    try {
      await getSharedPlayer().play(visualObjRef.current);
    } catch {
      setPlaying(false);
      if (playResetRef.current) clearTimeout(playResetRef.current);
      setPlaybackError(true);
    }
  }, []);

  const handleSave = useCallback(async () => {
    const audio = sourceBlobRef.current;
    if (!audio || !abc) return;
    setSaveState("saving");
    try {
      await saveEntry({
        audio,
        audioMimeType: audio.type,
        durationSec: durationSecRef.current,
        notes: notesRef.current,
        notationAbc: abc,
        title: defaultTitle(),
        tags: [],
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [abc]);

  const handleStartOver = useCallback(() => {
    getSharedPlayer().stop();
    setPlaying(false);
    setPlaybackError(false);
    setAbc(null);
    setSaveState("idle");
    visualObjRef.current = null;
    sourceBlobRef.current = null;
    notesRef.current = [];
    setPhase("idle");
  }, []);

  const onRendered = useCallback((visualObj: VisualObj) => {
    visualObjRef.current = visualObj;
  }, []);

  const isRecording = phase === "recording";

  return (
    <main className="screen">
      <header className="screen__header">
        <h1 className="screen__title">{strings.appName}</h1>
        <p className="screen__tagline">{strings.tagline}</p>
        <p className="screen__disclaimer">{strings.disclaimer}</p>
      </header>

      <div className="screen__body">
        <Walkthrough />

        {(phase === "idle" ||
          phase === "requesting-mic" ||
          phase === "recording") && (
          <>
            <RecordButton
              recording={isRecording}
              elapsedMs={elapsedMs}
              disabled={phase === "requesting-mic"}
              onStart={() => void handleRecord()}
              onStop={() => void finishRecording()}
            />
            {phase === "idle" && (
              <button
                type="button"
                className="btn btn--ghost screen__example"
                onClick={handleExample}
              >
                {strings.record.tryExample}
              </button>
            )}
            {phase === "idle" && entryCount !== null && entryCount > 0 && (
              <button
                type="button"
                className="link screen__songbook-link"
                onClick={() => navigate("/songbook")}
              >
                {strings.nav.songbook} ({entryCount})
              </button>
            )}
            {/* Subordinate to recording: fill the vault from existing memos. */}
            {phase === "idle" && <ImportPanel />}
          </>
        )}

        {phase === "transcribing" && (
          <Progress
            label={modelReady ? strings.progress.transcribing : strings.progress.warming}
          />
        )}

        {phase === "ready" && abc && (
          <>
            <NotationView
              abc={abc}
              playing={playing}
              onRendered={onRendered}
              onPlay={() => void handlePlay()}
              onStartOver={handleStartOver}
              playPrimary={false}
            />

            {saveState === "error" ? (
              <StatusMessage
                tone="error"
                title={strings.saveError.title}
                body={strings.saveError.body}
                actionLabel={strings.saveError.action}
                onAction={() => void handleSave()}
              />
            ) : saveState === "saved" ? (
              <div className="save save--done">
                <p className="save__done" role="status">
                  {strings.save.saved}
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => navigate("/songbook")}
                >
                  {strings.save.viewInSongbook}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--primary save__action"
                onClick={() => void handleSave()}
                disabled={saveState === "saving"}
              >
                {saveState === "saving" ? strings.save.saving : strings.save.action}
              </button>
            )}

            {playbackError && (
              <StatusMessage
                tone="error"
                title={strings.playbackError.title}
                body={strings.playbackError.body}
                actionLabel={strings.playbackError.action}
                onAction={() => void handlePlay()}
              />
            )}
          </>
        )}

        {phase === "mic-denied" && (
          <StatusMessage
            tone="error"
            title={strings.micDenied.title}
            body={strings.micDenied.body}
            actionLabel={strings.micDenied.action}
            onAction={() => void handleRecord()}
          />
        )}

        {phase === "no-mic" && (
          <StatusMessage
            tone="error"
            title={strings.noMic.title}
            body={strings.noMic.body}
            actionLabel={strings.noMic.action}
            onAction={() => window.location.reload()}
          />
        )}

        {phase === "empty-result" && (
          <StatusMessage
            title={strings.emptyResult.title}
            body={strings.emptyResult.body}
            actionLabel={strings.emptyResult.action}
            onAction={handleStartOver}
          />
        )}

        {phase === "error" && (
          <StatusMessage
            tone="error"
            title={strings.transcribeError.title}
            body={strings.transcribeError.body}
            actionLabel={strings.transcribeError.action}
            onAction={handleStartOver}
          />
        )}
      </div>
    </main>
  );
}

function Progress({ label }: { label: string }) {
  return (
    <div className="progress" role="status" aria-live="polite">
      <span className="progress__spinner" aria-hidden="true" />
      <p className="progress__label">{label}</p>
    </div>
  );
}
