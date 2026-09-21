import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getMeta, setMeta, FIRST_RUN_COMPLETE } from "../db/meta";

// The guided first run. It walks a brand-new user through recording (or the
// example), saving, and humming to search once, then never shows again. The
// completion flag lives in IndexedDB so a returning user never sees it. State
// lives here, above the screens, so progress survives navigation between them.

export interface OnboardingState {
  active: boolean;
  step: 1 | 2 | 3;
  saved: boolean;
  searched: boolean;
  markDraftReady: () => void;
  markSaved: () => void;
  markSearched: () => void;
  skip: () => void;
}

// A stable no-op used when a screen renders outside the provider (isolated
// component tests). The guide is simply inactive.
const INACTIVE: OnboardingState = {
  active: false,
  step: 1,
  saved: false,
  searched: false,
  markDraftReady: () => {},
  markSaved: () => {},
  markSearched: () => {},
  skip: () => {},
};

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saved, setSaved] = useState(false);
  const [searched, setSearched] = useState(false);

  // Decide once, on mount, whether the guide runs this session.
  useEffect(() => {
    let cancelled = false;
    void getMeta<boolean>(FIRST_RUN_COMPLETE)
      .then((done) => {
        if (!cancelled && !done) setActive(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const complete = useCallback(() => {
    setActive(false);
    void setMeta(FIRST_RUN_COMPLETE, true).catch(() => {});
  }, []);

  const markDraftReady = useCallback(() => {
    setStep((s) => (s === 1 ? 2 : s));
  }, []);

  const markSaved = useCallback(() => {
    setSaved(true);
    setStep(3);
  }, []);

  const markSearched = useCallback(() => {
    setSearched(true);
  }, []);

  const skip = useCallback(() => {
    complete();
  }, [complete]);

  // The first save-and-search ends the guide, whichever order they happen in.
  useEffect(() => {
    if (active && saved && searched) complete();
  }, [active, saved, searched, complete]);

  const value = useMemo<OnboardingState>(
    () => ({
      active,
      step,
      saved,
      searched,
      markDraftReady,
      markSaved,
      markSearched,
      skip,
    }),
    [active, step, saved, searched, markDraftReady, markSaved, markSearched, skip],
  );

  return (
    <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingState {
  return useContext(OnboardingContext) ?? INACTIVE;
}
