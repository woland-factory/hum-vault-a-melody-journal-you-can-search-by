import { useCallback, useEffect, useRef, useState } from "react";
import { strings } from "../copy/strings";
import {
  startRecording,
  RecorderError,
  MAX_RECORDING_MS,
  type Recording,
} from "../audio/recorder";
import { decodeToMono22050 } from "../audio/decode";
import { transcribe, warmUpModel } from "../transcribe/basicPitch";
import { computeContour } from "../melody/contour";
import { rankMatches } from "../melody/search";
import { listContours, getEntry } from "../db/entries";
import type { Entry, SearchCandidate } from "../db/schema";
import { abcToVisualObj } from "../notation/renderAbc";
import { getSharedPlayer } from "../playback/player";
import { estimateMelodyMs } from "../melody/duration";
import { navigate } from "../router/useHashRoute";
import RecordButton from "./RecordButton";
import EntryRow from "./EntryRow";
import StatusMessage from "./StatusMessage";
import Walkthrough from "./Walkthrough";
import { useOnboarding } from "../onboarding/OnboardingContext";

// The signature screen: hum a fragment of an old idea and Hum Vault returns the
// closest saved ideas ranked by melody. It runs the exact capture pipeline
// capture uses, so the query is transcribed the same way the corpus was, then
// matches the query contour against every stored contour in memory. The query
// hum is transient: transcribed and matched, never saved.

type Phase =
  | "loading"
  | "empty-corpus"
  | "idle"
  | "requesting-mic"
  | "recording"
  | "transcribing"
  | "results"
  | "no-match"
  | "no-notes"
  | "mic-denied"
  | "no-mic"
  | "error";

const EXAMPLE_URL = "/example-hum.wav";

export default function SearchScreen() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const [results, setResults] = useState<Entry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { markSearched } = useOnboarding();

  const candidatesRef = useRef<SearchCandidate[] | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishingRef = useRef(false);
  const mountedRef = useRef(true);

  const loadCorpus = useCallback(async (): Promise<SearchCandidate[] | null> => {
    try {
      const candidates = await listContours();
      candidatesRef.current = candidates;
      return candidates;
    } catch {
      return null;
    }
  }, []);

  // Warm the model in the background and check the corpus on mount. An empty
  // corpus lands on the designed empty-corpus state, never a dead "no results".
  useEffect(() => {
    mountedRef.current = true;
    void warmUpModel()
      .then(() => {
        if (mountedRef.current) setModelReady(true);
      })
      .catch(() => {});
    void loadCorpus().then((candidates) => {
      if (!mountedRef.current) return;
      if (candidates === null) {
        setPhase("error");
        return;
      }
      setPhase(candidates.length === 0 ? "empty-corpus" : "idle");
    });
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (playResetRef.current) clearTimeout(playResetRef.current);
      recordingRef.current?.cancel();
      // The shared player is reused across screens, so stop it on unmount.
      getSharedPlayer().stop();
    };
  }, [loadCorpus]);

  // A search that returns results is the third guided step. This advances the
  // guide whether the query came from a recording or the example.
  useEffect(() => {
    if (phase === "results") markSearched();
  }, [phase, markSearched]);

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

  const runPipeline = useCallback(
    async (loadAudio: () => Promise<Blob>) => {
      setPhase("transcribing");
      try {
        const blob = await loadAudio();
        const audio = await decodeToMono22050(blob);
        const notes = await transcribe(audio);
        if (!mountedRef.current) return;
        setModelReady(true);
        if (notes.length === 0) {
          setPhase("no-notes");
          return;
        }
        // The query contour is computed and matched in memory, never saved.
        const queryContour = computeContour(notes);
        let candidates = candidatesRef.current;
        if (!candidates) {
          const loaded = await loadCorpus();
          if (!mountedRef.current) return;
          if (loaded === null) {
            setPhase("error");
            return;
          }
          candidates = loaded;
        }
        const matches = rankMatches(queryContour, candidates);
        if (matches.length === 0) {
          setPhase("no-match");
          return;
        }
        // Load the full entry for each shown match (top limit only) so results
        // look and play like songbook rows. Order follows the ranking.
        const loaded = await Promise.all(matches.map((m) => getEntry(m.id)));
        if (!mountedRef.current) return;
        const found = loaded.filter((e): e is Entry => Boolean(e));
        if (found.length === 0) {
          setPhase("no-match");
          return;
        }
        setResults(found);
        setPhase("results");
      } catch {
        if (mountedRef.current) setPhase("error");
      }
    },
    [loadCorpus],
  );

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
    setPhase("requesting-mic");
    void warmUpModel()
      .then(() => {
        if (mountedRef.current) setModelReady(true);
      })
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
    void warmUpModel()
      .then(() => {
        if (mountedRef.current) setModelReady(true);
      })
      .catch(() => {});
    void runPipeline(async () => {
      const res = await fetch(EXAMPLE_URL);
      if (!res.ok) throw new Error("Could not load the example.");
      return res.blob();
    });
  }, [runPipeline]);

  const handleAgain = useCallback(() => {
    getSharedPlayer().stop();
    if (playResetRef.current) clearTimeout(playResetRef.current);
    setActiveId(null);
    setResults([]);
    setPhase("idle");
  }, []);

  const handlePlay = useCallback((entry: Entry) => {
    // Feedback within 100ms: reflect the active row immediately.
    setActiveId(entry.id);
    if (playResetRef.current) clearTimeout(playResetRef.current);
    playResetRef.current = setTimeout(
      () => setActiveId(null),
      Math.max(1200, estimateMelodyMs(entry.notes)),
    );
    const visualObj = abcToVisualObj(entry.notationAbc);
    if (!visualObj) {
      setActiveId(null);
      if (playResetRef.current) clearTimeout(playResetRef.current);
      return;
    }
    void getSharedPlayer()
      .play(visualObj)
      .catch(() => {
        setActiveId(null);
        if (playResetRef.current) clearTimeout(playResetRef.current);
      });
  }, []);

  const isRecording = phase === "recording";

  return (
    <main className="screen">
      <header className="screen__header">
        <button
          type="button"
          className="link detail__back"
          onClick={() => navigate("/songbook")}
        >
          {strings.nav.songbook}
        </button>
      </header>

      <div className="screen__body">
        <Walkthrough />

        {phase === "loading" && <Progress label={strings.progress.warming} />}

        {phase === "empty-corpus" && (
          <StatusMessage
            title={strings.search.emptyCorpus.title}
            body={strings.search.emptyCorpus.body}
            actionLabel={strings.search.emptyCorpus.action}
            onAction={() => navigate("/")}
          />
        )}

        {(phase === "idle" ||
          phase === "requesting-mic" ||
          phase === "recording") && (
          <div className="search__prompt">
            <h1 className="screen__title">{strings.search.heading}</h1>
            <p className="screen__tagline">{strings.search.intro}</p>
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
          </div>
        )}

        {phase === "transcribing" && (
          <Progress
            label={modelReady ? strings.progress.transcribing : strings.progress.warming}
          />
        )}

        {phase === "results" && (
          <>
            <h1 className="screen__title search__results-heading">
              {strings.search.resultsHeading}
            </h1>
            <ul className="entry-list">
              {results.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  playing={activeId === entry.id}
                  onPlay={() => handlePlay(entry)}
                  onOpen={() => navigate(`/entry/${entry.id}`)}
                />
              ))}
            </ul>
            <button
              type="button"
              className="btn btn--ghost search__again"
              onClick={handleAgain}
            >
              {strings.search.again}
            </button>
          </>
        )}

        {phase === "no-match" && (
          <StatusMessage
            title={strings.search.noMatch.title}
            body={strings.search.noMatch.body}
            actionLabel={strings.search.noMatch.action}
            onAction={handleAgain}
          />
        )}

        {phase === "no-notes" && (
          <StatusMessage
            title={strings.search.noNotes.title}
            body={strings.search.noNotes.body}
            actionLabel={strings.search.noNotes.action}
            onAction={handleAgain}
          />
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

        {phase === "error" && (
          <StatusMessage
            tone="error"
            title={strings.search.error.title}
            body={strings.search.error.body}
            actionLabel={strings.search.error.action}
            onAction={handleAgain}
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
