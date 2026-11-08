"use client";

import { useState } from "react";

import { ResultsUploadCard, type ResultsUploadView } from "@/components/connections/results-files";

const AGENTS = [
  { slug: "growth-architect", name: "Growth Architect" },
  { slug: "brand-studio", name: "Brand Studio" },
];

const UPLOADS: ResultsUploadView[] = [
  {
    id: "u1",
    fileName: "google-ads-october.csv",
    label: "Google Ads",
    currency: "USD",
    createdAt: Date.UTC(2026, 10, 2, 15, 30),
    status: "ready",
    code: null,
    ignoredColumns: [],
    agents: ["growth-architect"],
    summary: {
      rows: 62,
      dateStart: "2026-10-01",
      dateStop: "2026-10-31",
      metrics: ["spend", "impressions", "clicks", "conversions", "revenue"],
      totals: { spend: 2140.5, impressions: 58200, clicks: 1912, conversions: 41, revenue: 9840 },
      groupBy: "Campaign",
      groups: [
        { name: "Search - Deep cleaning Austin", spend: 1320.25, impressions: 31000, clicks: 1204, conversions: 29, revenue: 7010 },
        { name: "Search - Move-out", spend: 640.25, impressions: 19400, clicks: 560, conversions: 10, revenue: 2480 },
        { name: "Search - Brand", spend: 180, impressions: 7800, clicks: 148, conversions: 2, revenue: 350 },
      ],
      otherGroups: 0,
    },
  },
  {
    id: "u2",
    fileName: "jobber-bookings.csv",
    label: "Jobber bookings",
    currency: "USD",
    createdAt: Date.UTC(2026, 10, 3, 9, 0),
    status: "ready",
    code: null,
    ignoredColumns: ["Client name", "Email", "Phone", "Street address"],
    agents: [],
    summary: {
      rows: 118,
      dateStart: "2026-09-01",
      dateStop: "2026-10-31",
      metrics: ["conversions", "revenue"],
      totals: { conversions: 118, revenue: 31420 },
      groupBy: "Source",
      groups: [
        { name: "Google", conversions: 52, revenue: 14100 },
        { name: "Referral", conversions: 38, revenue: 10920 },
        { name: "Facebook", conversions: 28, revenue: 6400 },
      ],
      otherGroups: 4,
    },
  },
  {
    id: "u3",
    fileName: "customers.csv",
    label: "Customer list",
    currency: "USD",
    createdAt: Date.UTC(2026, 10, 4, 12, 0),
    status: "refused",
    code: "personal_data",
    ignoredColumns: ["First name", "Last name", "Email", "Phone"],
    agents: [],
    summary: null,
  },
  {
    id: "u4",
    fileName: "mailchimp.csv",
    label: "Mailchimp",
    currency: "USD",
    createdAt: Date.UTC(2026, 10, 5, 12, 0),
    status: "processing",
    code: null,
    ignoredColumns: [],
    agents: [],
    summary: null,
  },
];

/** Results files as an owner sees them: ready, ready with columns skipped, refused, and still reading. */
export function ResultsFilesStory() {
  const [uploads, setUploads] = useState(UPLOADS);
  return (
    <main className="mx-auto grid max-w-4xl gap-4 p-4 sm:p-8">
      <h1 className="font-heading text-xl text-foreground">Results files</h1>
      {uploads.map((upload) => (
        <ResultsUploadCard
          key={upload.id}
          upload={upload}
          agents={AGENTS}
          canEdit
          canGrant
          highlighted={upload.id === "u1"}
          onGrant={(slug, granted) =>
            setUploads((rows) =>
              rows.map((row) =>
                row.id === upload.id ? { ...row, agents: granted ? [...row.agents, slug] : row.agents.filter((agent) => agent !== slug) } : row,
              ),
            )
          }
          onRemove={() => setUploads((rows) => rows.filter((row) => row.id !== upload.id))}
        />
      ))}
    </main>
  );
}
