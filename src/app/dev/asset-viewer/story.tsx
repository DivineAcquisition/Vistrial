"use client";

import { useState } from "react";

import { EvidenceList, VersionCompare, VersionHistory, type EvidenceView } from "@/components/assets/asset-parts";
import { AssetRow, type AssetRowView } from "@/components/assets/asset-row";
import { ReportBody } from "@/components/assets/report-body";
import { Panel } from "@/components/ui/panel";

const T0 = Date.UTC(2026, 9, 27, 14, 0, 0);

const EVIDENCE: EvidenceView[] = [
  { claimKey: "durable", statement: "Twelve competitor ads have run for more than 30 days.", computed: true, fetchedAt: null, sourceLabel: null },
  { claimKey: "offer", statement: "The offer is a first deep clean at $300.", computed: false, fetchedAt: T0, sourceLabel: "Business profile, version 3" },
  { claimKey: "hook", statement: "Most long-running ads open with a before-and-after photo.", computed: false, fetchedAt: T0 + 60_000, sourceLabel: "Saved run record" },
  { claimKey: "broken", statement: "A claim whose source was deleted.", computed: false, fetchedAt: T0, sourceLabel: null },
];

const MARKET_REPORT = [
  "# Market report",
  "",
  "**Objective:** Find the offers and messages Austin deep-cleaning competitors lead with, and where we can stand out.",
  "",
  "Competitors we could see lead with trust or with before-and-after results, and none showed a price.",
  "",
  "## Opportunities",
  "",
  "### 1. Lead with visible flat-rate pricing",
  "",
  "- **Evidence:** Untested hypothesis",
  "- **Why it matters here:** Your offer is flat-rate. No competitor excerpt showed a price.",
  "- **Proposed action:** Check the top listings first, then list both prices on your profile.",
  "- **How to tell if it worked:** Compare four weeks of calls before and after.",
  "",
  "## Limits",
  "",
  "- **web:** Partial. Many pages were link-only.",
  "",
  "_Publicly visible ads and posts are not evidence that a campaign was profitable._",
].join("\n");

const BASIS_EVIDENCE: EvidenceView[] = [
  { claimKey: "finding-1", statement: "Trust is the most repeated lead message.", computed: false, fetchedAt: null, sourceLabel: null, basis: "observed", basisLabel: "Observed", sources: [{ id: "s1", platform: "web", title: "Molly Maid of Greater Austin", url: "https://www.mollymaid.com/greater-austin/", publisher: "Molly Maid", observedAt: T0, availability: "linkOnly" }], sourceMissing: false },
  { claimKey: "finding-2", statement: "A visible flat price may set the business apart.", computed: false, fetchedAt: null, sourceLabel: null, basis: "inferred", basisLabel: "Inference", sources: [], sourceMissing: false },
  { claimKey: "opportunity-1", statement: "Lead with visible flat-rate pricing.", computed: false, fetchedAt: null, sourceLabel: null, basis: "hypothesis", basisLabel: "Untested hypothesis", sources: [], sourceMissing: false },
  { claimKey: "finding-3", statement: "Not enough data: no competitor prices were collected.", computed: false, fetchedAt: null, sourceLabel: null, basis: "insufficient", basisLabel: "Not enough data", sources: [], sourceMissing: false },
];

const V1 = "Market snapshot\n42 ads from 9 advertisers.\nTop hook: before and after.\nTest plan: 3 ideas.";
const V2 = "Market snapshot\n42 ads from 9 advertisers.\nTop hook: before and after photos.\nGap: nobody shows pricing.\nTest plan: 3 ideas.";

const ROWS: AssetRowView[] = [
  { id: "a1", title: "Ad research: home cleaning, Austin", kind: "researchReport", status: "draft", currentVersion: 2, createdAt: T0, createdByRun: "r1" },
  { id: "a2", title: "Spring offer copy set", kind: "adCopySet", status: "approved", currentVersion: 1, createdAt: T0 - 86_400_000, createdByRun: null },
];

/** Asset screen parts from fake data. Development only. */
export function AssetViewerStory() {
  const [selected, setSelected] = useState(2);
  return (
    <div className="mx-auto grid min-h-screen w-full max-w-5xl gap-6 bg-background p-4 sm:p-8">
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Asset screen parts. Fake data, development only.
      </p>
      <Panel className="grid gap-3 p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">Market report body</h2>
        <ReportBody body={MARKET_REPORT} />
      </Panel>
      <Panel className="grid gap-3 p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">Claims with basis badges</h2>
        <EvidenceList evidence={BASIS_EVIDENCE} />
      </Panel>
      <Panel className="grid gap-3 p-4 sm:p-6">
        <h2 className="font-heading text-base text-card-foreground">Queue rows</h2>
        <ul className="grid gap-3">
          {ROWS.map((row) => (
            <li key={row.id}>
              <AssetRow asset={row} />
            </li>
          ))}
        </ul>
      </Panel>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="grid min-w-0 gap-6">
          <Panel className="grid gap-3 p-4 sm:p-6">
            <h2 className="font-heading text-base text-card-foreground">Compare</h2>
            <VersionCompare before={V1} after={V2} beforeVersion={1} afterVersion={2} />
          </Panel>
          <Panel className="grid gap-3 p-4 sm:p-6">
            <h2 className="font-heading text-base text-card-foreground">Claims and evidence</h2>
            <EvidenceList evidence={EVIDENCE} />
          </Panel>
        </div>
        <Panel className="grid content-start gap-3 p-4 sm:p-6">
          <h2 className="font-heading text-base text-card-foreground">Versions</h2>
          <VersionHistory
            versions={[
              { version: 1, createdBy: "agent", createdAt: T0 },
              { version: 2, createdBy: "person", createdAt: T0 + 3_600_000 },
            ]}
            current={2}
            selected={selected}
            onSelect={setSelected}
          />
        </Panel>
      </div>
    </div>
  );
}
