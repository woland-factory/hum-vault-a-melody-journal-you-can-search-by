import { useCallback, useEffect, useRef, useState } from "react";
import { strings } from "../copy/strings";
import { deleteEntry, getEntry, updateEntry } from "../db/entries";
import type { Entry } from "../db/schema";
import { getSharedPlayer, type VisualObj } from "../playback/player";
import { estimateMelodyMs } from "../melody/duration";
import { navigate } from "../router/useHashRoute";
import NotationView from "./NotationView";
import TagEditor from "./TagEditor";
import ConfirmDialog from "./ConfirmDialog";
import StatusMessage from "./StatusMessage";

type LoadState = "loading" | "found" | "notfound" | "error";

export default function EntryDetailScreen({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [pending, setPending] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [editingNotation, setEditingNotation] = useState(false);
  const [abcDraft, setAbcDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const visualObjRef = useRef<VisualObj | null>(null);
  const playResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    setState("loading");
    getEntry(id)
      .then((found) => {
        if (!active) return;
        if (!found) {
          setState("notfound");
          return;
        }
        setEntry(found);
        setTitleDraft(found.title);
        setAbcDraft(found.notationAbc);
        setState("found");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    return () => {
      if (playResetRef.current) clearTimeout(playResetRef.current);
      getSharedPlayer().stop();
    };
  }, []);

  // Optimistic persist: reflect the change immediately, reconcile with the
  // stored (normalized) entry on success, revert and surface the error on
  // failure.
  const persist = useCallback(
    async (
      patch: Partial<Pick<Entry, "title" | "tags" | "notationAbc">>,
      optimistic: Entry,
    ) => {
      const prev = entry;
      setEntry(optimistic);
      setSaveError(false);
      setPending(true);
      try {
        const updated = await updateEntry(id, patch);
        setEntry(updated);
        setTitleDraft(updated.title);
        return updated;
      } catch {
        if (prev) {
          setEntry(prev);
          setTitleDraft(prev.title);
        }
        setSaveError(true);
        return null;
      } finally {
        setPending(false);
      }
    },
    [entry, id],
  );

  const handleTitleBlur = useCallback(() => {
    if (!entry) return;
    const next = titleDraft.trim();
    if (next.length === 0 || next === entry.title) {
      setTitleDraft(entry.title);
      return;
    }
    void persist({ title: next }, { ...entry, title: next });
  }, [entry, titleDraft, persist]);

  const handleAddTag = useCallback(
    (tag: string) => {
      if (!entry) return;
      void persist({ tags: [...entry.tags, tag] }, { ...entry, tags: [...entry.tags, tag] });
    },
    [entry, persist],
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      if (!entry) return;
      const next = entry.tags.filter((t) => t !== tag);
      void persist({ tags: next }, { ...entry, tags: next });
    },
    [entry, persist],
  );

  const handleSaveNotation = useCallback(async () => {
    if (!entry) return;
    const next = abcDraft;
    if (next.trim().length === 0) {
      setSaveError(true);
      return;
    }
    const updated = await persist({ notationAbc: next }, { ...entry, notationAbc: next });
    if (updated) setEditingNotation(false);
  }, [entry, abcDraft, persist]);

  const handlePlay = useCallback(() => {
    if (!visualObjRef.current || !entry) return;
    setPlaybackError(false);
    setPlaying(true);
    if (playResetRef.current) clearTimeout(playResetRef.current);
    playResetRef.current = setTimeout(
      () => setPlaying(false),
      Math.max(1200, estimateMelodyMs(entry.notes)),
    );
    void getSharedPlayer()
      .play(visualObjRef.current)
      .catch(() => {
        setPlaying(false);
        if (playResetRef.current) clearTimeout(playResetRef.current);
        setPlaybackError(true);
      });
  }, [entry]);

  const handleConfirmDelete = useCallback(async () => {
    try {
      await deleteEntry(id);
      setConfirmingDelete(false);
      navigate("/songbook");
    } catch {
      setConfirmingDelete(false);
      setSaveError(true);
    }
  }, [id]);

  const onRendered = useCallback((visualObj: VisualObj) => {
    visualObjRef.current = visualObj;
  }, []);

  if (state === "loading") {
    return (
      <DetailShell>
        <div className="detail__skeleton" aria-hidden="true">
          <span className="skeleton skeleton--title" />
          <span className="skeleton skeleton--paper" />
        </div>
      </DetailShell>
    );
  }

  if (state === "notfound") {
    return (
      <DetailShell>
        <StatusMessage
          title={strings.entryNotFound.title}
          body={strings.entryNotFound.body}
          actionLabel={strings.entryNotFound.action}
          onAction={() => navigate("/songbook")}
        />
      </DetailShell>
    );
  }

  if (state === "error" || !entry) {
    return (
      <DetailShell>
        <StatusMessage
          tone="error"
          title={strings.songbookError.title}
          body={strings.songbookError.body}
          actionLabel={strings.songbookError.action}
          onAction={() => navigate("/songbook")}
        />
      </DetailShell>
    );
  }

  const previewAbc = editingNotation ? abcDraft : entry.notationAbc;

  return (
    <DetailShell>
      <div className="detail">
        <div className="field">
          <label className="field__label" htmlFor="entry-title">
            {strings.detail.titleLabel}
          </label>
          <input
            id="entry-title"
            type="text"
            className="input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        </div>

        <section className="detail__notation" aria-label={strings.detail.notationHeading}>
          {previewAbc.trim().length > 0 && (
            <NotationView
              abc={previewAbc}
              playing={playing}
              onRendered={onRendered}
              onPlay={handlePlay}
            />
          )}
          {playbackError && (
            <StatusMessage
              tone="error"
              title={strings.playbackError.title}
              body={strings.playbackError.body}
              actionLabel={strings.playbackError.action}
              onAction={handlePlay}
            />
          )}

          {editingNotation ? (
            <div className="field">
              <label className="field__label" htmlFor="entry-notation">
                {strings.detail.notationLabel}
              </label>
              <textarea
                id="entry-notation"
                className="input textarea"
                rows={6}
                value={abcDraft}
                onChange={(e) => setAbcDraft(e.target.value)}
              />
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void handleSaveNotation()}
                disabled={pending}
              >
                {pending ? strings.save.saving : strings.detail.saveNotation}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setAbcDraft(entry.notationAbc);
                setEditingNotation(true);
              }}
            >
              {strings.detail.editNotation}
            </button>
          )}
        </section>

        <TagEditor
          tags={entry.tags}
          onAdd={handleAddTag}
          onRemove={handleRemoveTag}
          busy={pending}
        />

        {saveError && (
          <StatusMessage
            tone="error"
            title={strings.saveError.title}
            body={strings.saveError.body}
            actionLabel={strings.saveError.action}
            onAction={() => setSaveError(false)}
          />
        )}

        <button
          type="button"
          className="btn btn--danger detail__delete"
          onClick={() => setConfirmingDelete(true)}
        >
          {strings.detail.delete}
        </button>
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title={strings.deleteConfirm.title}
          body={strings.deleteConfirm.body}
          confirmLabel={strings.deleteConfirm.confirm}
          cancelLabel={strings.deleteConfirm.cancel}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </DetailShell>
  );
}

function DetailShell({ children }: { children: React.ReactNode }) {
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
        {/* One programmatic top-level heading for the screen. The visible title
            is an editable field, so this stays visually hidden but present in
            every phase (loading, found, not found, error). */}
        <h1 className="visually-hidden">{strings.detail.heading}</h1>
      </header>
      <div className="screen__body">{children}</div>
    </main>
  );
}
