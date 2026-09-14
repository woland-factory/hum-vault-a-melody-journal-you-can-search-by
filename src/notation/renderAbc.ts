import abcjs from "abcjs";
import type { VisualObj } from "../playback/player";

// Render an ABC string to the tune object the synth needs, without mounting a
// full NotationView. The songbook list uses this to play a row on demand. The
// render happens in a transient, visually hidden, in-DOM container that is
// removed immediately after.
export function abcToVisualObj(abc: string): VisualObj | null {
  if (typeof document === "undefined") return null;
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.width = "0";
  container.style.height = "0";
  container.style.overflow = "hidden";
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);
  try {
    const rendered = abcjs.renderAbc(container, abc, { add_classes: true });
    return rendered && rendered[0] ? rendered[0] : null;
  } catch {
    return null;
  } finally {
    container.remove();
  }
}
