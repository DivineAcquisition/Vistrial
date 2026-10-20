/** How far a finger must travel before a swipe asks for a confirmation tap. */
export const SWIPE_THRESHOLD = 72;

export function swipeIntent(dx: number, threshold = SWIPE_THRESHOLD): "right" | "left" | null {
  if (dx >= threshold) return "right";
  if (dx <= -threshold) return "left";
  return null;
}

/** Calm mode and reduced motion keep the buttons. Swipe is never the only way. */
export function motionAllowsSwipe(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (document.documentElement.dataset.calm === "true") return false;
  return true;
}
