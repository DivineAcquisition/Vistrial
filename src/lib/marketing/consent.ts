const STORAGE_KEY = "vistrial_site_measurement";

export type MeasurementChoice = "on" | "off" | "unset";

type NavigatorWithGpc = Navigator & { globalPrivacyControl?: boolean };

export function globalPrivacyControlOn(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as NavigatorWithGpc).globalPrivacyControl === true;
}

export function measurementChoice(): MeasurementChoice {
  if (typeof window === "undefined") return "unset";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "on" || stored === "off") return stored;
  return "unset";
}

/** First-party page counts stay off until the visitor allows them, and stay off when Global Privacy Control is on. */
export function optionalAnalyticsAllowedFrom(choice: MeasurementChoice, gpc: boolean): boolean {
  if (gpc) return false;
  return choice === "on";
}

export function optionalAnalyticsAllowed(): boolean {
  return optionalAnalyticsAllowedFrom(measurementChoice(), globalPrivacyControlOn());
}

export function setMeasurementChoice(choice: "on" | "off"): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, choice);
  window.dispatchEvent(new Event("vistrial-measurement"));
}
