"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useLayoutEffect, useSyncExternalStore } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { applyTheme, readTheme, saveTheme, storedTheme, THEME_LOCK_ATTRIBUTE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as Theme);
  return [theme, saveTheme];
}

/**
 * In development React resets <html> to its JSX attributes on the Strict Mode
 * remount, dropping the class the head script set. Put it back before paint.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(storedTheme());
  }, []);
  return null;
}

/** The public site stays white, whatever theme the workspace saved on this device. */
export function ForceLightTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute(THEME_LOCK_ATTRIBUTE, "light");
    applyTheme("light");
    return () => {
      root.removeAttribute(THEME_LOCK_ATTRIBUTE);
      applyTheme(storedTheme());
    };
  }, []);
  return null;
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "dark" ? "Switch to the dark theme" : "Switch to the light theme";
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => setTheme(next)}
            aria-label={label}
            aria-pressed={theme === "dark"}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-card-foreground",
              className
            )}
          />
        }
      >
        {theme === "dark" ? <SunIcon className="size-4" aria-hidden /> : <MoonIcon className="size-4" aria-hidden />}
      </TooltipTrigger>
      <TooltipContent>{next === "dark" ? "Dark theme" : "Light theme"}</TooltipContent>
    </Tooltip>
  );
}
