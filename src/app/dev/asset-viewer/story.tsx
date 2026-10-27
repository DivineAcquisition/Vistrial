"use client";

import { useState } from "react";

import { EvidenceList, VersionCompare, VersionHistory, type EvidenceView } from "@/components/assets/asset-parts";
import { AssetRow, type AssetRowView } from "@/components/assets/asset-row";
import { Panel } from "@/components/ui/panel";

const T0 = Date.UTC(2026, 9, 27, 14, 0, 0);

const EVIDENCE: EvidenceView[] = [
  { claimKey: "durable", statement: "Twelve competitor ads have run for more than 30 days.", computed: true, fetchedAt: null, sourceLabel: null },
  { claimKey: "offer", statement: "The offer is a first deep clean at $300.", computed: false, fetchedAt: T0, sourceLabel: "Business profile, version 3" },
  { claimKey: "hook", statement: "Most long-running ads open with a before-and-after photo.", computed: false, fetchedAt: T0 + 60_000, sourceLabel: "Saved run record" },
  { claimKey: "broken", statement: "A claim whose source was deleted.", computed: false, fetchedAt: T0, sourceLabel: null },
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
