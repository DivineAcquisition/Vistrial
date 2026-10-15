export type SubprocessorPublic = {
  company: string;
  purpose: string;
  dataHandled: string;
  location: string;
};

export type TrustSwitches = {
  aiNoTraining: boolean;
  encryptionAtRest: boolean;
  backups: boolean;
  noSell: boolean;
  staffMfa: boolean;
};

export type TrustPublic = {
  securityEmail: string;
  vulnerabilityEmail: string;
  privacyEmail: string;
  legalEmail: string;
  supportEmail: string;
  securityUpdatedOn: string;
  subprocessorsUpdatedOn: string;
  privacyUpdatedOn: string;
  termsUpdatedOn: string;
  legalEntity: string | null;
  mailingAddress: string | null;
  governingPlace: string;
  switches: TrustSwitches;
  privacyLive: boolean;
  termsLive: boolean;
  safeHarborLive: boolean;
  securityTxtExpiresOn: string;
};

export const TRUST_FALLBACK: TrustPublic = {
  securityEmail: "contact@vistrial.io",
  vulnerabilityEmail: "contact@vistrial.io",
  privacyEmail: "contact@vistrial.io",
  legalEmail: "contact@vistrial.io",
  supportEmail: "contact@vistrial.io",
  securityUpdatedOn: "2026-10-14",
  subprocessorsUpdatedOn: "2026-10-14",
  privacyUpdatedOn: "2026-10-15",
  termsUpdatedOn: "2026-10-14",
  legalEntity: null,
  mailingAddress: null,
  governingPlace: "Maryland, United States",
  switches: {
    aiNoTraining: false,
    encryptionAtRest: false,
    backups: false,
    noSell: false,
    staffMfa: false,
  },
  privacyLive: false,
  termsLive: false,
  safeHarborLive: false,
  securityTxtExpiresOn: "2027-10-15",
};

export function snapshotHasNoInternalAddress(raw: Record<string, unknown>): boolean {
  const text = JSON.stringify(raw).toLowerCase();
  return !("internal_forward_email" in raw) && !text.includes("divineacquisition");
}

export function asTrust(raw: Record<string, unknown> | null): TrustPublic {
  if (!raw) return TRUST_FALLBACK;
  const bool = (key: string) => raw[key] === true;
  return {
    securityEmail: String(raw.security_email || TRUST_FALLBACK.securityEmail),
    vulnerabilityEmail: String(raw.vulnerability_email || TRUST_FALLBACK.vulnerabilityEmail),
    privacyEmail: String(raw.privacy_email || TRUST_FALLBACK.privacyEmail),
    legalEmail: String(raw.legal_email || TRUST_FALLBACK.legalEmail),
    supportEmail: String(raw.support_email || TRUST_FALLBACK.supportEmail),
    securityUpdatedOn: String(raw.security_updated_on || TRUST_FALLBACK.securityUpdatedOn).slice(0, 10),
    subprocessorsUpdatedOn: String(raw.subprocessors_updated_on || TRUST_FALLBACK.subprocessorsUpdatedOn).slice(0, 10),
    privacyUpdatedOn: String(raw.privacy_updated_on || TRUST_FALLBACK.privacyUpdatedOn).slice(0, 10),
    termsUpdatedOn: String(raw.terms_updated_on || TRUST_FALLBACK.termsUpdatedOn).slice(0, 10),
    legalEntity: raw.legal_entity_name ? String(raw.legal_entity_name) : null,
    mailingAddress: raw.mailing_address ? String(raw.mailing_address) : null,
    governingPlace: String(raw.governing_place || TRUST_FALLBACK.governingPlace),
    switches: {
      aiNoTraining: bool("switch_ai_no_training"),
      encryptionAtRest: bool("switch_encryption_at_rest"),
      backups: bool("switch_backups"),
      noSell: bool("switch_no_sell"),
      staffMfa: bool("switch_staff_mfa"),
    },
    privacyLive: bool("privacy_live"),
    termsLive: bool("terms_live"),
    safeHarborLive: bool("safe_harbor_live"),
    securityTxtExpiresOn: String(raw.security_txt_expires_on || TRUST_FALLBACK.securityTxtExpiresOn).slice(0, 10),
  };
}

export function formatTrustDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
