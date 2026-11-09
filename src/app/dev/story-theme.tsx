"use client";

import { useLayoutEffect } from "react";

import { THEME_LOCK_ATTRIBUTE } from "@/lib/theme";

/** Stories sit outside /app, which the site keeps light. `?theme=dark` shows the workspace's dark theme. */
export function StoryTheme({ theme }: { theme: string }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.removeAttribute(THEME_LOCK_ATTRIBUTE);
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return null;
}
