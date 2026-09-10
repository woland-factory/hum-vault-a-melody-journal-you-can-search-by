import { useEffect, useRef } from "react";
import abcjs from "abcjs";
import { strings } from "../copy/strings";
import type { VisualObj } from "../playback/player";

interface NotationViewProps {
  abc: string;
  playing: boolean;
  onRendered: (visualObj: VisualObj) => void;
  onPlay: () => void;
  onStartOver: () => void;
}

// Renders the draft ABC with abcjs and hosts the Play and Record another
// controls. Lifts the rendered tune object so the player can sound it.
export default function NotationView({
  abc,
  playing,
  onRendered,
  onPlay,
  onStartOver,
}: NotationViewProps) {
  const paperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paperRef.current) return;
    const rendered = abcjs.renderAbc(paperRef.current, abc, {
      responsive: "resize",
      add_classes: true,
    });
    if (rendered && rendered[0]) onRendered(rendered[0]);
  }, [abc, onRendered]);

  return (
    <section className="notation" aria-label={strings.ready.heading}>
      <h2 className="notation__heading">{strings.ready.heading}</h2>
      <div className="notation__paper" ref={paperRef} data-testid="notation-paper" />
      <div className="notation__actions">
        <button
          type="button"
          className={`btn btn--primary${playing ? " btn--active" : ""}`}
          onClick={onPlay}
        >
          {playing ? strings.ready.playing : strings.ready.play}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onStartOver}>
          {strings.ready.startOver}
        </button>
      </div>
    </section>
  );
}
