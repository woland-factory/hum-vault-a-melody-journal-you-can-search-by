import { useState } from "react";
import { strings } from "../copy/strings";

interface TagEditorProps {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

// Tag chips with an accessible remove control, plus an input and Add action.
// Validation (trim, length, count, duplicates) is enforced in the persistence
// layer; this surface keeps the interaction simple.
export default function TagEditor({ tags, onAdd, onRemove }: TagEditorProps) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const tag = draft.trim();
    if (tag.length === 0) return;
    onAdd(tag);
    setDraft("");
  };

  return (
    <div className="tag-editor">
      <span className="field__label" id="tags-label">
        {strings.detail.tagsLabel}
      </span>
      {tags.length > 0 && (
        <ul className="tag-list" aria-labelledby="tags-label">
          {tags.map((tag) => (
            <li key={tag} className="tag-chip">
              <span className="tag-chip__text">{tag}</span>
              <button
                type="button"
                className="tag-chip__remove"
                aria-label={`${strings.detail.removeTagPrefix} ${tag}`}
                onClick={() => onRemove(tag)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="tag-editor__add">
        <input
          type="text"
          className="input tag-editor__input"
          value={draft}
          placeholder={strings.detail.addTagPlaceholder}
          aria-label={strings.detail.addTagPlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="btn btn--secondary" onClick={submit}>
          {strings.detail.addTagAction}
        </button>
      </div>
    </div>
  );
}
