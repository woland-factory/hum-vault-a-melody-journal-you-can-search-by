import { useSyncExternalStore } from "react";

// A tiny hash router for three views. Hash routing needs no server change: the
// hash never reaches the server, and the SPA's try_files already serves
// index.html. No router library for three routes.

export type Route =
  | { name: "capture" }
  | { name: "songbook" }
  | { name: "entry"; id: string };

function parseHash(hash: string): Route {
  // Strip a leading "#" and optional "/".
  const path = hash.replace(/^#/, "");
  if (path === "" || path === "/") return { name: "capture" };
  if (path === "/songbook") return { name: "songbook" };
  const entryMatch = path.match(/^\/entry\/([^/]+)$/);
  if (entryMatch) return { name: "entry", id: decodeURIComponent(entryMatch[1]) };
  return { name: "capture" };
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function getSnapshot(): string {
  return window.location.hash;
}

export function useHashRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getSnapshot, () => "");
  return parseHash(hash);
}

export function navigate(path: string): void {
  // path is a hash-relative path like "/songbook" or "/entry/abc".
  const normalized = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === normalized) return;
  window.location.hash = normalized;
}
