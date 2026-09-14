import { useCallback, useEffect, useRef, useState } from "react";
import { strings } from "../copy/strings";
import { listEntries } from "../db/entries";
import type { Entry } from "../db/schema";
import { abcToVisualObj } from "../notation/renderAbc";
import { getSharedPlayer } from "../playback/player";
import { estimateMelodyMs } from "../melody/duration";
import { navigate } from "../router/useHashRoute";
import EntryRow from "./EntryRow";
import StatusMessage from "./StatusMessage";

type LoadState = "loading" | "loaded" | "error";

const PAGE_SIZE = 30;

export default function SongbookScreen() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const playResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFirstPage = useCallback(async () => {
    setState("loading");
    try {
      const page = await listEntries({ limit: PAGE_SIZE });
      setEntries(page.entries);
      setNextBefore(page.nextBefore);
      setState("loaded");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    return () => {
      if (playResetRef.current) clearTimeout(playResetRef.current);
      getSharedPlayer().stop();
    };
  }, []);

  const handleShowMore = useCallback(async () => {
    if (nextBefore === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listEntries({ limit: PAGE_SIZE, before: nextBefore });
      setEntries((prev) => [...prev, ...page.entries]);
      setNextBefore(page.nextBefore);
    } catch {
      // Keep what is already shown; the primary list load owns the error state.
    } finally {
      setLoadingMore(false);
    }
  }, [nextBefore, loadingMore]);

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

  return (
    <main className="screen">
      <header className="screen__header">
        <div className="screen__topbar">
          <h1 className="screen__title">{strings.nav.songbook}</h1>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => navigate("/")}
          >
            {strings.nav.recordFromSongbook}
          </button>
        </div>
      </header>

      <div className="screen__body">
        {state === "loading" && <SongbookSkeleton />}

        {state === "error" && (
          <StatusMessage
            tone="error"
            title={strings.songbookError.title}
            body={strings.songbookError.body}
            actionLabel={strings.songbookError.action}
            onAction={() => void loadFirstPage()}
          />
        )}

        {state === "loaded" && entries.length === 0 && (
          <StatusMessage
            title={strings.songbookEmpty.title}
            body={strings.songbookEmpty.body}
            actionLabel={strings.songbookEmpty.action}
            onAction={() => navigate("/")}
          />
        )}

        {state === "loaded" && entries.length > 0 && (
          <>
            <ul className="entry-list">
              {entries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  playing={activeId === entry.id}
                  onPlay={() => handlePlay(entry)}
                  onOpen={() => navigate(`/entry/${entry.id}`)}
                />
              ))}
            </ul>
            {nextBefore !== null && (
              <button
                type="button"
                className="btn btn--ghost songbook__more"
                onClick={() => void handleShowMore()}
                disabled={loadingMore}
              >
                {strings.nav.showMore}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}

// Holds the layout steady while the first page loads.
function SongbookSkeleton() {
  return (
    <ul className="entry-list" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="entry-row entry-row--skeleton">
          <span className="skeleton skeleton--title" />
          <span className="skeleton skeleton--date" />
        </li>
      ))}
    </ul>
  );
}
