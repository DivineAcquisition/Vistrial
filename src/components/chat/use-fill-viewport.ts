"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Stretches a chat column from where it starts down to the bottom of the screen, so the chat box sits at the
 * bottom like Claude or ChatGPT even when the conversation is short. Measures the real offset instead of
 * guessing header heights, and leaves room for the page's bottom padding (the mobile tab bar).
 */
export function useFillViewport<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const fit = () => {
      const top = node.getBoundingClientRect().top + window.scrollY;
      const main = node.closest("main");
      const gap = main
        ? parseFloat(getComputedStyle(main).paddingBottom) || 0
        : 0;
      node.style.minHeight = `calc(100dvh - ${Math.max(0, Math.round(top + gap))}px)`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return ref;
}
