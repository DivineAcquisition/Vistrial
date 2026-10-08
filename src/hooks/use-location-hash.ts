"use client";

import { useSyncExternalStore } from "react";

const EVENT = "vistrial:location-hash";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * Next's <Link> moves the hash with pushState after its transition commits and
 * fires no event, so a nav click re-checks the hash for the next few frames.
 */
export function watchLocationHash(): void {
  let frames = 0;
  const tick = () => {
    window.dispatchEvent(new Event(EVENT));
    if (++frames < 30) window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
}

/** The URL hash, e.g. "#results". The server always sees "". */

export function useLocationHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
}
