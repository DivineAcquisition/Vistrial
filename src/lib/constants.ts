export const APP_NAME = "Vistrial";
export const APP_OWNER = "Divine Acquisition";

/** Legal operator named in the privacy policy. */
export const LEGAL_ENTITY = "Divine Acquisition LLC";

export const COMPANY_ADDRESS = "7404 Executive Place, Lanham, MD 20706";

/** Canonical operator app origin. Other hostnames land later. */
export const PRODUCTION_APP_ORIGIN = "https://app.vistrial.io";

/** Public marketing site. This is the URL people paste into Slack and DMs. */
export const PRODUCTION_SITE_ORIGIN = "https://vistrial.io";

/**
 * Core Forsight (ads, creatives, pipeline) bookmark host. Same deployment and
 * login as app.vistrial.io — not a second app, and not Stellar.
 */
export const PRODUCTION_FORSIGHT_ORIGIN = "https://pulse.vistrial.io";

/**
 * Stellar's host. A separate product from core Vistrial, sharing auth and
 * org records. The hostname is forsight.vistrial.io as specified; pulse.vistrial.io
 * is core Forsight and must never serve Stellar.
 */
export const PRODUCTION_STELLAR_ORIGIN = "https://forsight.vistrial.io";

/** Public contact — matches the privacy policy. */
export const CONTACT_EMAIL = "contact@vistrial.io";

/** Data-protection and legal requests. */
export const LEGAL_EMAIL = "legal@divineacquisition.io";

export const PRIVACY_LAST_UPDATED = "8/25/2026";
export const PRIVACY_EFFECTIVE = "8/25/2026";

/** Filled from the draft's [DATE] placeholders when this page was published. */
export const TERMS_LAST_UPDATED = "8/23/2026";
export const TERMS_EFFECTIVE = "8/23/2026";

export const DISCLAIMER_LAST_UPDATED = "8/22/2026";
