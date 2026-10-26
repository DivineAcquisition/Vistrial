/**
 * The workspace theme. White is the default; a person can switch to dark and
 * the choice is kept in a cookie and localStorage on this device. The public
 * site stays white. A lock of "light" or "dark" wins over that choice.
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "vistrial-theme";

export const THEME_COLOR: Record<Theme, string> = {
  light: "#ffffff",
  dark: "#07070b",
};

/** Set by a surface that must stay light or dark, so a saved choice cannot override it. */
export const THEME_LOCK_ATTRIBUTE = "data-theme-lock";

/**
 * Runs in <head> before the first paint. The public site stays white.
 * On the workspace, a saved dark choice is applied before paint.
 */
export const THEME_SCRIPT = `(function(){try{var path=location.pathname;var product=path==="/app"||path.indexOf("/app/")===0||path==="/admin"||path.indexOf("/admin/")===0;var c=document.querySelector('meta[name="theme-color"]');if(!product){document.documentElement.classList.remove("dark");document.documentElement.setAttribute("${THEME_LOCK_ATTRIBUTE}","light");if(c)c.setAttribute("content","${THEME_COLOR.light}");return}var m=document.cookie.match(/(?:^|; )${THEME_KEY}=(light|dark)/);var t=m?m[1]:localStorage.getItem("${THEME_KEY}");if(t==="dark"){document.documentElement.classList.add("dark");if(c)c.setAttribute("content","${THEME_COLOR.dark}")}}catch(e){}})()`;

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

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const lock = root.getAttribute(THEME_LOCK_ATTRIBUTE);
  const shown: Theme = lock === "light" || lock === "dark" ? lock : theme;
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
