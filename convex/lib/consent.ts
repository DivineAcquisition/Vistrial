export type Consent = "unknown" | "granted" | "revoked";

/** Revoked wins. A grant wins over unknown. Do-not-contact is kept if either person has it. */
export function stricterConsent(left: Consent, right: Consent): Consent {
  if (left === "revoked" || right === "revoked") return "revoked";
  if (left === "granted" || right === "granted") return "granted";
  return "unknown";
}

export type ConsentSnapshot = {
  emailConsent: Consent;
  textConsent: Consent;
  callConsent: Consent;
  doNotContact: boolean;
  optedOutAt?: number;
};

export function mergeConsent(
  survivor: ConsentSnapshot,
  other: ConsentSnapshot,
): ConsentSnapshot {
  const opted = [survivor.optedOutAt, other.optedOutAt].filter((value): value is number => value !== undefined);
  return {
    emailConsent: stricterConsent(survivor.emailConsent, other.emailConsent),
    textConsent: stricterConsent(survivor.textConsent, other.textConsent),
    callConsent: stricterConsent(survivor.callConsent, other.callConsent),
    doNotContact: survivor.doNotContact || other.doNotContact,
    optedOutAt: opted.length ? Math.min(...opted) : undefined,
  };
}
