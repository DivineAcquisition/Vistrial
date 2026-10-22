/**
 * The workspace theme. White is the default; a person can switch to dark and
 * the choice is kept in a cookie and localStorage on this device. The public
 * site and the auth desk wrap themselves in `.dark` and ignore the choice.
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "vistrial-theme";

export const THEME_COLOR: Record<Theme, string> = {
  light: "#ffffff",
  dark: "#07070b",
};

/**
 * Runs in <head> before the first paint, so a dark choice never flashes white.
 * Reads the cookie first because it is sent with every request, then storage.
 */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_KEY}=(light|dark)/);var t=m?m[1]:localStorage.getItem("${THEME_KEY}");if(t==="dark"){document.documentElement.classList.add("dark");var c=document.querySelector('meta[name="theme-color"]');if(c)c.setAttribute("content","${THEME_COLOR.dark}")}}catch(e){}})()`;

export function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function storedTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const match = document.cookie.match(new RegExp(`(?:^|; )${THEME_KEY}=(light|dark)`));
  if (match) return match[1] as Theme;
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Set by surfaces that are always dark, so menus and dialogs they portal to <body> match. */
export const THEME_LOCK_ATTRIBUTE = "data-theme-lock";

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const shown: Theme = root.getAttribute(THEME_LOCK_ATTRIBUTE) === "dark" ? "dark" : theme;
  root.classList.toggle("dark", shown === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[shown]);
}

export function saveTheme(theme: Theme): void {
  applyTheme(theme);
  document.cookie = `${THEME_KEY}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode can refuse storage. The cookie still carries the choice.
  }
}
