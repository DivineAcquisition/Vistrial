export const STAGES = ["foundation", "organization", "execution"] as const;

export type Stage = (typeof STAGES)[number];

export type CatalogAgent = {
  slug: string;
  name: string;
  stage: Stage;
  job: string;
  promise: string;
  sort: number;
};

/**
 * Seed rows for the agents table. The rail reads the table, not this list.
 */
export const CATALOG: CatalogAgent[] = [
  {
    slug: "compass",
    name: "Compass",
    stage: "foundation",
    job: "Drafts the Foundation and answers from records a person can see.",
    promise: "Compass never sends anything a lead can see, and never edits a live playbook.",
    sort: 0,
  },
  {
    slug: "scribe",
    name: "Scribe",
    stage: "organization",
    job: "Brings every source into one structured record.",
    promise: "Scribe never invents a fact it did not read, and never contacts a lead.",
    sort: 1,
  },
  {
    slug: "assay",
    name: "Assay",
    stage: "organization",
    job: "Scores every lead, orders the list, and shows the reasons.",
    promise: "Assay never contacts a lead.",
    sort: 2,
  },
  {
    slug: "relay",
    name: "Relay",
    stage: "execution",
    job: "Owns the playbooks and writes every message as a draft.",
    promise: "Relay never sends. A person approves every draft.",
    sort: 3,
  },
  {
    slug: "sentry",
    name: "Sentry",
    stage: "execution",
    job: "Watches response times and raises alerts to the right people.",
    promise: "Sentry never messages a lead.",
    sort: 4,
  },
  {
    slug: "helm",
    name: "Helm",
    stage: "execution",
    job: "Drafts each rep's end of day report and keeps the scorecards.",
    promise: "Helm never messages a lead.",
    sort: 5,
  },
];
