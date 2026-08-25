export type ClientSurface = "mobile" | "desktop";

/**
 * What the operator is actually holding, not what the User-Agent claims.
 * Coarse pointer, a narrow viewport, or an installed home-screen app counts
 * as the phone. This is the signal training and adoption watch use.
 */
export function detectClientSurface(
  input: {
    maxTouchPoints?: number;
    pointerCoarse?: boolean;
    standalone?: boolean;
    innerWidth?: number;
  } = typeof window === "undefined"
    ? {}
    : {
        maxTouchPoints: navigator.maxTouchPoints,
        pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
        standalone:
          window.matchMedia("(display-mode: standalone)").matches ||
          ("standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone)),
        innerWidth: window.innerWidth,
      }
): ClientSurface {
  if (input.standalone) return "mobile";
  if (input.pointerCoarse) return "mobile";
  if ((input.maxTouchPoints ?? 0) > 0 && (input.innerWidth ?? 1024) < 768) return "mobile";
  if ((input.innerWidth ?? 1024) < 768) return "mobile";
  return "desktop";
}

export function isClientSurface(value: string | null | undefined): value is ClientSurface {
  return value === "mobile" || value === "desktop";
}
