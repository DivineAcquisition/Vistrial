"use client";

import { useState } from "react";

import { SiteCaptureView, type CaptureData } from "@/components/settings/brand-section";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { BrandsTabView } from "@/components/work/brands-tab";
import type { BrandKitFull, BrandKitRow } from "@/components/work/types";
import { EMPTY_BRAND, brandGaps } from "../../../../convex/lib/brandKits";
import { emptyResult, type CaptureResult } from "../../../../convex/lib/siteCapture/fields";

import { StoryFrame } from "../work-tabs/story-frame";

const noop = async () => undefined;
const SITE = "https://brightline-media.example.com/";
const AT = Date.UTC(2026, 10, 12);

/** A small inline logo, so the story needs no network. */
const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 48"><rect width="48" height="48" rx="10" fill="#0e5e6f"/><path d="M14 34 L24 14 L34 34" stroke="#f2b134" stroke-width="5" fill="none" stroke-linecap="round"/><text x="58" y="31" font-family="Arial" font-size="17" font-weight="700" fill="#0e5e6f">Brightline</text></svg>`,
)}`;

const PAGES: CaptureData["pages"] = [
  { id: "p1", url: SITE, kind: "home", title: "Brightline Media | Paid ads for coaches", read: true, reason: null },
  { id: "p2", url: `${SITE}book`, kind: "booking", title: "Book a strategy call", read: true, reason: null },
  { id: "p3", url: `${SITE}pricing`, kind: "pricing", title: "Pricing", read: true, reason: null },
  { id: "p4", url: `${SITE}free-audit`, kind: "optin", title: "Free ad account audit", read: true, reason: null },
  { id: "p5", url: `${SITE}case-studies`, kind: "results", title: "Case studies", read: true, reason: null },
  { id: "p6", url: `${SITE}about`, kind: "about", title: "About", read: false, reason: "This site's robots.txt asks crawlers not to open this page, so Vistrial did not." },
  { id: "b1", url: "https://calendly.com/brightline/strategy", kind: "booking", title: "Book a call", read: false, reason: "On your booking tool's site. Recorded, not read." },
];

const src = (pageId: string, quote?: string, how: "page text" | "stylesheet" | "structured data" | "meta tag" = "page text") => ({ url: PAGES.find((row) => row.id === pageId)!.url, pageId, how, ...(quote ? { quote } : {}) });

const RESULT: CaptureResult = {
  ...emptyResult(),
  pages: PAGES.map((page) => ({ ...page, kind: page.kind as CaptureResult["pages"][number]["kind"] })),
  name: { value: "Brightline Media", origin: "site", basis: "stated", sources: [src("p1", undefined, "structured data")] },
  logo: { value: { url: `${SITE}logo.svg`, storageId: "s1", from: "The logo in your site's header" }, origin: "site", basis: "stated", sources: [src("p1", undefined, "structured data")] },
  colors: {
    value: [
      { hex: "#0e5e6f", label: "Set as your site's theme colour" },
      { hex: "#f2b134", label: 'Your "accent" colour' },
      { hex: "#d9534f", label: "Used on your buttons and links" },
    ],
    origin: "site",
    basis: "stated",
    sources: [src("p1", undefined, "meta tag"), src("p1", undefined, "stylesheet")],
  },
  headingFont: { value: "Manrope", origin: "site", basis: "stated", sources: [src("p1", undefined, "stylesheet")] },
  bodyFont: { value: "Inter", origin: "site", basis: "stated", sources: [src("p1", undefined, "stylesheet")] },
  tone: {
    value: {
      text: "Confident and plain, numbers first. Speaks to coaches as a peer, in short sentences.",
      quotes: ["We don't do vanity metrics. We do booked calls.", "Coaches we work with add 20 to 40 booked calls a month."],
    },
    origin: "site",
    basis: "reading",
    sources: [src("p1", "We don't do vanity metrics. We do booked calls.")],
  },
  audience: { value: "Coaches and course creators selling programs above $2,000", origin: "site", basis: "stated", sources: [src("p1", "For coaches and course creators selling programs above $2,000.")] },
  location: missingString(),
  offers: {
    value: [
      { name: "Booked Calls Engine", price: "$3,500 a month", included: ["Meta ads management", "Landing page and booking flow", "Weekly report"], guarantee: "", terms: "Three month minimum", pageId: "p3", quote: "Booked Calls Engine: $3,500 a month, three month minimum." },
      { name: "Free ad account audit", price: "", included: [], guarantee: "", terms: "", pageId: "p4", quote: "Get a free audit of your ad account in 48 hours." },
    ],
    origin: "site",
    basis: "stated",
    sources: [src("p3", "Booked Calls Engine: $3,500 a month, three month minimum.")],
  },
  proof: {
    value: [{ text: "A coach went from 9 to 31 booked calls a month", pageId: "p5", quote: "\"We went from 9 to 31 booked calls a month in ten weeks.\" Dana Ruiz, business coach" }],
    origin: "site",
    basis: "stated",
    sources: [src("p5", "\"We went from 9 to 31 booked calls a month in ten weeks.\" Dana Ruiz, business coach")],
  },
  guarantees: missingQuoted(),
  social: { value: [{ host: "Instagram", url: "https://instagram.com/brightlinemedia" }, { host: "LinkedIn", url: "https://linkedin.com/company/brightline-media" }], origin: "site", basis: "stated", sources: [src("p1")] },
  dropped: 2,
};

function missingString() {
  return { value: null, origin: "missing" as const, basis: "stated" as const, sources: [] };
}
function missingQuoted() {
  return { value: null, origin: "missing" as const, basis: "stated" as const, sources: [] };
}

const DONE: CaptureData = {
  id: "c1",
  url: SITE,
  status: "done",
  progress: [
    { key: "home", label: "Opening your home page", state: "done" },
    { key: "pages", label: "Reading your pages (5 of 5)", state: "done" },
    { key: "brand", label: "Finding your logo, colours and fonts", state: "done" },
    { key: "words", label: "Reading your offers, prices and tone of voice", state: "done" },
  ],
  pages: PAGES,
  result: RESULT,
  logoUrl: LOGO,
  reason: null,
  free: true,
  appliedAt: null,
};

const STATES: Record<string, CaptureData | null> = {
  empty: null,
  reading: {
    ...DONE,
    status: "reading",
    result: null,
    logoUrl: null,
    progress: [
      { key: "home", label: "Opening your home page", state: "done" },
      { key: "pages", label: "Reading your pages (2 of 5)", state: "active" },
      { key: "brand", label: "Finding your logo, colours and fonts", state: "waiting" },
      { key: "words", label: "Reading your offers, prices and tone of voice", state: "waiting" },
    ],
  },
  done: DONE,
  viewer: DONE,
  partial: { ...DONE, status: "partial", result: { ...RESULT, tone: missingString(), offers: missingString(), proof: missingQuoted(), audience: missingString() } as unknown as CaptureResult },
  failed: { ...DONE, status: "failed", result: null, logoUrl: null, reason: "The site showed a bot check. Vistrial does not solve or bypass them.", pages: [PAGES[0]] },
};

const OWN = { ...EMPTY_BRAND, version: 1, name: "Brightline Media", website: SITE, industry: "Paid ads agency", tone: "Confident and plain, numbers first.", colors: [{ label: "Teal", hex: "#0e5e6f" }], logos: [], styleRefs: [], note: "From your website", createdAt: AT };
const KIT: BrandKitFull = { id: "own" as BrandKitFull["id"], kind: "own", name: OWN.name, currentVersion: 1, archived: false, versions: [OWN] };
const ROWS: BrandKitRow[] = [{ id: KIT.id, kind: "own", name: OWN.name, versions: 1, updatedAt: AT, industry: OWN.industry, colors: OWN.colors, logoUrl: null, gaps: brandGaps(OWN) }];

/** Settings › Brand with fixture data: a paid ads agency for coaches. */
export function SettingsBrandStory({ state, theme }: { state: string; theme: string }) {
  const [target, setTarget] = useState("own");
  const viewer = state === "viewer";
  const capture = Object.hasOwn(STATES, state) ? STATES[state] : DONE;
  return (
    <StoryFrame theme={theme} role={viewer ? "viewer" : "owner"}>
      <SettingsLayout role={viewer ? "viewer" : "owner"} section="brand" onSection={() => undefined} hrefFor={(section) => `?section=${section}`}>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <p className="text-sm leading-relaxed text-muted-foreground">The brand every creative is made with: your own, and one for each client. Read each website to fill it in, then change anything by hand.</p>
            <div role="tablist" aria-label="Whose brand" className="flex flex-wrap gap-2">
              {[
                { id: "own", name: "Your brand" },
                { id: "northside", name: "Northside Coaching" },
              ].map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="tab"
                  aria-selected={target === row.id}
                  onClick={() => setTarget(row.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${target === row.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {row.name}
                </button>
              ))}
            </div>
          </div>
          <SiteCaptureView
            key={state}
            target="own"
            capture={capture}
            quote={{ free: state === "empty", maxCredits: 150, canAfford: true, canStart: !viewer }}
            editor={!viewer}
            actions={{ start: noop, apply: noop }}
          />
          <BrandsTabView editor={!viewer} kits={ROWS} kit={KIT} onSelectKit={() => undefined} onSave={noop} onArchive={noop} onUploadLogo={async () => "s2"} initialEditing={null} />
        </div>
      </SettingsLayout>
    </StoryFrame>
  );
}

/** The same agency capture, for the onboarding story. */
export { DONE as STORY_CAPTURE_DONE, STATES as STORY_CAPTURES };
