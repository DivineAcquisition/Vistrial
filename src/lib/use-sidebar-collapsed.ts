"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "vistrial:sidebar-collapsed";
const EVENT = "vistrial:sidebar-collapsed-change";

/**
 * Whether the sidebar is collapsed, read straight from local storage.
 *
 * `useSyncExternalStore` rather than an effect: the server has no preference to
 * read, so it renders expanded, and the client swaps to the stored value in the
 * same commit instead of flashing one state and then the other.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** `true` collapsed, `false` expanded, `null` when the person has not chosen. */
function getSnapshot(): boolean | null {
  const stored = window.localStorage.getItem(KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return null;
}

function getServerSnapshot(): boolean | null {
  return null;
}

export function useSidebarCollapsed(): {
  /** null until the person collapses or expands the sidebar themselves. */
  preference: boolean | null;
  setCollapsed: (next: boolean) => void;
} {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setCollapsed = useCallback((next: boolean) => {
    window.localStorage.setItem(KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { preference, setCollapsed };
}
