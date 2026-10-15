export const CONSENT_COOKIE = "vistrial_consent";
export const CONSENT_VERSION_DEFAULT = 1;
export const CONSENT_LIFETIME_DAYS = 365;
export const CONSENT_DISMISS_DAYS = 30;

export type ConsentMode = "accept" | "reject" | "custom" | "dismiss";

export type StoredConsent = {
  v: number;
  a: 0 | 1;
  d: 0 | 1;
  m: ConsentMode;
  t: number;
  /** 1 when the visitor deliberately chose after a Global Privacy Control signal. */
  o: 0 | 1;
};

const MODES = new Set<ConsentMode>(["accept", "reject", "custom", "dismiss"]);

export function serializeConsent(choice: StoredConsent): string {
  return `v=${choice.v}&a=${choice.a}&d=${choice.d}&m=${choice.m}&t=${choice.t}&o=${choice.o}`;
}

export function parseConsent(raw: string | null | undefined): StoredConsent | null {
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const mode = params.get("m");
  if (!mode || !MODES.has(mode as ConsentMode)) return null;
  const version = Number(params.get("v"));
  const at = Number(params.get("t"));
  if (!Number.isFinite(version) || !Number.isFinite(at)) return null;
  return {
    v: version,
    a: params.get("a") === "1" ? 1 : 0,
    d: params.get("d") === "1" ? 1 : 0,
    m: mode as ConsentMode,
    t: at,
    o: params.get("o") === "1" ? 1 : 0,
  };
}

export function consentIsCurrent(
  choice: StoredConsent | null,
  version: number,
  now = Date.now(),
  dismissDays = CONSENT_DISMISS_DAYS,
  lifetimeDays = CONSENT_LIFETIME_DAYS,
): boolean {
  if (!choice || choice.v !== version) return false;
  const age = now - choice.t;
  const days = choice.m === "dismiss" ? dismissDays : lifetimeDays;
  return age >= 0 && age < days * 24 * 60 * 60 * 1000;
}

/** Analytics and advertising stay off until an explicit current choice allows them. */
export function categoryAllowed(args: {
  choice: StoredConsent | null;
  category: "analytics" | "advertising";
  gpc: boolean;
  version: number;
  now?: number;
  dismissDays?: number;
  lifetimeDays?: number;
}): boolean {
  if (!consentIsCurrent(args.choice, args.version, args.now, args.dismissDays, args.lifetimeDays)) return false;
  const choice = args.choice;
  if (!choice) return false;
  if (args.gpc && choice.o !== 1) return false;
  if (choice.m === "dismiss" || choice.m === "reject") return false;
  return args.category === "analytics" ? choice.a === 1 : choice.d === 1;
}

export function choiceFromMode(mode: ConsentMode, version: number, gpc: boolean, now = Date.now()): StoredConsent {
  const on = mode === "accept" ? 1 : 0;
  return { v: version, a: on, d: on, m: mode, t: now, o: gpc && mode !== "dismiss" ? 1 : 0 };
}

type NavigatorWithGpc = Navigator & { globalPrivacyControl?: boolean };

export function globalPrivacyControlOn(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as NavigatorWithGpc).globalPrivacyControl === true;
}

export function readConsentCookie(): StoredConsent | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split("; ");
  const row = parts.find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  if (!row) return null;
  return parseConsent(decodeURIComponent(row.slice(CONSENT_COOKIE.length + 1)));
}

export function writeConsentCookie(choice: StoredConsent, maxAgeSeconds: number): boolean {
  if (typeof document === "undefined") return false;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(choice))}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
    window.localStorage.removeItem("vistrial_site_measurement");
    window.dispatchEvent(new Event("vistrial-consent"));
    return document.cookie.includes(`${CONSENT_COOKIE}=`);
  } catch {
    return false;
  }
}

/**
 * useSyncExternalStore compares snapshots with Object.is. Returning a new
 * object when the key has not changed makes React re-render forever.
 */
export function rememberSnapshot<T>(slot: { key: string; value?: T }, key: string, create: () => T): T {
  if (slot.key === key && slot.value !== undefined) return slot.value;
  const value = create();
  slot.key = key;
  slot.value = value;
  return value;
}

export function optionalAnalyticsAllowed(): boolean {
  const choice = readConsentCookie();
  return categoryAllowed({
    choice,
    category: "analytics",
    gpc: globalPrivacyControlOn(),
    version: choice?.v ?? CONSENT_VERSION_DEFAULT,
  });
}
