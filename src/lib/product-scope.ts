/**
 * Compile-time product scope for the Vistrial MVP (items 2.1–2.6).
 *
 * Parked surfaces stay in the tree so they can be restored without a rebuild.
 * They are excluded from navigation and return 404 from their routes.
 * Do not introduce environment-variable flags or new services here.
 */
export const PRODUCT_SCOPE = {
  /** Call-quality coaching UI, disclosure, and reporting/coaching tab. */
  coaching: false,
  /** Org-wide activity stream page. Case-file timeline stays. */
  activityStream: false,
  /** Follow-up sequence settings. The drafting engine stays running. */
  followUpSettings: false,
  /** Client-facing PDFs, branded reports, and scheduled report email. */
  documentGeneration: false,
  /** Airtable creative performance (spend / CAC / ROAS). */
  forsightCreatives: false,
  /** Airtable weekly pulse vanity metrics. Pipeline Health stays on. */
  forsightWeeklyPulse: false,
  /**
   * Reporting panels outside the MVP metric list: close-rate outcome, team,
   * follow-up, objections, sources, terminal, duplicate speed, readiness,
   * contribution, ingestion, plus extra coverage/throughput breakdowns.
   */
  extraReporting: false,
  /** Pipeline Health: going-quiet and debriefs-missing sections. */
  extraPipeline: false,
  /** Portal: adoption, leak diagnosis, PDF summary, email schedule. */
  extraPortal: false,
} as const;

export type ProductScopeKey = keyof typeof PRODUCT_SCOPE;

export function isProductScopeEnabled(key: ProductScopeKey): boolean {
  return PRODUCT_SCOPE[key];
}
