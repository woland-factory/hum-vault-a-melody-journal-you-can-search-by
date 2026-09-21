import { strings } from "../copy/strings";
import type { Entry } from "../db/schema";
import { formatEntryDate } from "../util/formatDate";

interface EntryRowProps {
  entry: Entry;
  playing: boolean;
  onPlay: () => void;
  onOpen: () => void;
}

// One songbook row: enough to recognize the idea (title, date, tags) with a
// Play control and a way to open the entry. The row itself opens detail; the
// Play button stops propagation so it plays without navigating.
export default function EntryRow({ entry, playing, onPlay, onOpen }: EntryRowProps) {
  return (
    <li className="entry-row">
      <button type="button" className="entry-row__open" onClick={onOpen}>
        <span className="entry-row__titleline">
          <span className="entry-row__title">{entry.title}</span>
          {entry.isDemo && (
            <span className="entry-row__badge">{strings.demo.badge}</span>
          )}
        </span>
        <span className="entry-row__date">{formatEntryDate(entry.createdAt)}</span>
        {entry.tags.length > 0 && (
          <span className="entry-row__tags">
            {entry.tags.map((tag) => (
              <span key={tag} className="tag-chip tag-chip--static">
                {tag}
              </span>
            ))}
          </span>
        )}
      </button>
      <button
        type="button"
        className={`btn btn--secondary entry-row__play${playing ? " btn--active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
      >
        {playing ? strings.ready.playing : strings.nav.play}
      </button>
    </li>
  );
}
