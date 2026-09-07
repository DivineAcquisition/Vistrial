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

function getSnapshot(): boolean {
  return window.localStorage.getItem(KEY) === "1";
}

/** The sidebar starts expanded until a stored preference says otherwise. */
function getServerSnapshot(): boolean {
  return false;
}

export function useSidebarCollapsed(): {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
} {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setCollapsed = useCallback((next: boolean) => {
    window.localStorage.setItem(KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { collapsed, setCollapsed };
}
