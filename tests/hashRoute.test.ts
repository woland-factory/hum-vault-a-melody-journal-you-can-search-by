import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHashRoute, navigate } from "../src/router/useHashRoute";

beforeEach(() => {
  window.location.hash = "";
});

// jsdom does not fire hashchange on a location.hash assignment the way a real
// browser does, so drive navigation and the event together. The e2e suite
// exercises the real browser behavior end to end.
function go(path: string) {
  act(() => {
    navigate(path);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

describe("useHashRoute", () => {
  it("maps the empty hash to capture", () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toEqual({ name: "capture" });
  });

  it("maps #/songbook, #/search, and #/entry/:id", () => {
    const { result } = renderHook(() => useHashRoute());
    go("/songbook");
    expect(result.current).toEqual({ name: "songbook" });
    go("/search");
    expect(result.current).toEqual({ name: "search" });
    go("/entry/abc-123");
    expect(result.current).toEqual({ name: "entry", id: "abc-123" });
  });

  it("treats an unknown hash as capture (redirect target)", () => {
    const { result } = renderHook(() => useHashRoute());
    go("/nope/nowhere");
    expect(result.current).toEqual({ name: "capture" });
  });

  it("reacts to browser navigation (hashchange)", () => {
    const { result } = renderHook(() => useHashRoute());
    go("/songbook");
    expect(result.current.name).toBe("songbook");
    // Simulate the back button returning to the root hash.
    act(() => {
      window.location.hash = "";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current.name).toBe("capture");
  });

  it("decodes an encoded id segment", () => {
    const { result } = renderHook(() => useHashRoute());
    go("/entry/" + encodeURIComponent("a b/c"));
    expect(result.current).toEqual({ name: "entry", id: "a b/c" });
  });
});
