"use client";

import { useState } from "react";

import { BrandsTabView } from "@/components/work/brands-tab";
import type { BrandKitFull, BrandKitRow } from "@/components/work/types";
import { EMPTY_BRAND, brandGaps } from "../../../../convex/lib/brandKits";

import { StoryFrame } from "../work-tabs/story-frame";

const noop = async () => undefined;

/** A small inline logo, so the story needs no network. */
const logo = (fill: string, text: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="${fill}"/><text x="32" y="41" font-family="Arial" font-size="26" font-weight="700" text-anchor="middle" fill="${text}">N</text></svg>`)}`;

const AT = Date.UTC(2026, 10, 2);

const NORTHSIDE_V1 = {
  ...EMPTY_BRAND,
  version: 1,
  name: "Northside Dental",
  website: "https://northsidedental.com",
  industry: "Family dentistry",
  colors: [{ label: "Teal", hex: "#0f8b8d" }],
  tone: "Warm and plain-spoken.",
  regulated: "health" as const,
  logos: [],
  note: null,
  createdAt: AT,
};

const NORTHSIDE_V2 = {
  ...NORTHSIDE_V1,
  version: 2,
  colors: [
    { label: "Teal", hex: "#0f8b8d" },
    { label: "Sand", hex: "#f2e9dc" },
    { label: "Ink", hex: "#12263a" },
  ],
  headingFont: "Poppins",
  bodyFont: "Inter",
  imageStyle: "Bright, natural light. Real patients and staff, no stock-photo poses. Lots of white space.",
  tone: "Warm and plain-spoken. Short sentences. Never pushy.",
  useWords: ["gentle", "same-day", "family"],
  avoidWords: ["cheap", "painless"],
  examples: ["Nervous about the dentist? So were most of our patients."],
  disclaimers: ["Results vary by patient."],
  bannedTopics: ["Competitor names"],
  placements: ["1:1", "4:5", "9:16"] as ("1:1" | "4:5" | "9:16")[],
  logos: [
    { storageId: "s1", variant: "light" as const, name: "northside-teal.svg", url: logo("#0f8b8d", "#ffffff") },
    { storageId: "s2", variant: "dark" as const, name: "northside-white.svg", url: logo("#ffffff", "#0f8b8d") },
  ],
  logosOwned: true,
  note: "New logo after the rebrand",
  createdAt: AT + 6 * 86_400_000,
};

const OWN = { ...EMPTY_BRAND, version: 1, name: "Alpha Growth Agency", industry: "Marketing agency", tone: "Direct. Numbers first.", colors: [{ label: "Violet", hex: "#5b3df5" }], logos: [], note: null, createdAt: AT };

const KITS: Record<string, BrandKitFull> = {
  own: { id: "own" as BrandKitFull["id"], kind: "own", name: OWN.name, currentVersion: 1, archived: false, versions: [OWN] },
  northside: { id: "northside" as BrandKitFull["id"], kind: "client", name: "Northside Dental", currentVersion: 2, archived: false, versions: [NORTHSIDE_V1, NORTHSIDE_V2] },
};

const ROWS: BrandKitRow[] = [
  { id: KITS.own.id, kind: "own", name: OWN.name, versions: 1, updatedAt: AT, industry: OWN.industry, colors: OWN.colors, logoUrl: null, gaps: brandGaps(OWN) },
  { id: KITS.northside.id, kind: "client", name: "Northside Dental", versions: 2, updatedAt: NORTHSIDE_V2.createdAt, industry: "Family dentistry", colors: NORTHSIDE_V2.colors, logoUrl: NORTHSIDE_V2.logos[0].url, gaps: [] },
];

/** The Brands workspace with fixture data. `state`: full, empty, rep, new (the editor, blank), edit. */
export function BrandsTabStory({ state, theme }: { state: string; theme: string }) {
  const empty = state === "empty";
  const [chosen, setChosen] = useState("northside");
  return (
    <StoryFrame theme={theme} role={state === "rep" ? "rep" : "owner"}>
      <BrandsTabView
        editor={state !== "rep"}
        kits={empty ? [] : ROWS}
        kit={empty ? null : KITS[chosen]}
        onSelectKit={setChosen}
        onSave={noop}
        onArchive={noop}
        onUploadLogo={async () => `s${Date.now()}`}
        initialEditing={state === "new" ? "new" : state === "edit" ? "edit" : null}
      />
    </StoryFrame>
  );
}
