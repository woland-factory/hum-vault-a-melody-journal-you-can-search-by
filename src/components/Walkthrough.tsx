import { strings, fill } from "../copy/strings";
import { useOnboarding } from "../onboarding/OnboardingContext";

// A compact, non-modal guide chip. It sits above the screen's controls and
// shows one short step at a time with a Skip button. It never overlays or
// intercepts the real controls: it is just a bar in normal flow, so recording,
// saving, and searching stay fully operable by mouse, touch, and keyboard.

const STEP_LABEL = {
  1: strings.onboarding.step1,
  2: strings.onboarding.step2,
  3: strings.onboarding.step3,
} as const;

export default function Walkthrough() {
  const { active, step, skip } = useOnboarding();
  if (!active) return null;

  const progress = fill(strings.onboarding.progress, { n: step });

  return (
    <div
      className="walkthrough"
      data-testid="walkthrough"
      role="note"
      aria-live="polite"
      aria-label={progress}
    >
      <div className="walkthrough__text">
        <span className="walkthrough__progress">{progress}</span>
        <span className="walkthrough__label">{STEP_LABEL[step]}</span>
      </div>
      <button type="button" className="walkthrough__skip" onClick={skip}>
        {strings.onboarding.skip}
      </button>
    </div>
  );
}
