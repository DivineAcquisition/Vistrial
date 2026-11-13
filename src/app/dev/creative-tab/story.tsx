"use client";

import { CreativeImagesView } from "@/components/work/creative-images";
import { CreativeTabView } from "@/components/work/creative-tab";
import type { AddedReference, CreativeImageList, CreativeOptions, CreativeTabData, CreativeView } from "@/components/work/types";

import { StoryFrame } from "../work-tabs/story-frame";
import { SAMPLE_MODELS } from "@/components/models/sample";

const noop = async () => undefined;
const AT = Date.UTC(2026, 10, 9);
const id = <T,>(value: string) => value as unknown as T;

const OPTIONS: CreativeOptions = {
  kits: [
    { id: id("k1"), name: "Alpha Growth Agency", kind: "own", gaps: ["a logo file", "the placements you run"] },
    { id: id("k2"), name: "Northside Dental", kind: "client", gaps: [] },
  ],
  offers: [{ id: id("o1"), name: "New patient check-up", version: 2 }],
  sources: [
    { id: id("s1"), platform: "metaAdLibrary", kind: "ad", title: "BrightSmile: nervous about the dentist?", publisher: "BrightSmile Dental", url: "https://www.facebook.com/ads/library/?id=1", hook: "Calls out dental anxiety with a question", format: "Short vertical video", observedAt: AT },
    { id: id("s2"), platform: "youtube", kind: "short", title: "What a first visit actually looks like", publisher: "City Dental Co", url: "https://www.youtube.com/shorts/abc", hook: "Walks through the visit step by step", format: "Talking head", observedAt: AT },
    { id: id("s3"), platform: "tiktok", kind: "short", title: "3 things your dentist wishes you knew", publisher: "Dr. Lee", url: "https://www.tiktok.com/@x/video/1", hook: "Numbered list", format: "List", observedAt: AT },
  ],
  dials: [
    { value: "inspired", label: "Inspired by", keeps: "Keeps the kind of hook and the format. Everything else is new." },
    { value: "structure", label: "Same structure", keeps: "Keeps the kind of hook, the format, the kind of offer and where the call to action sits." },
    { value: "close", label: "Close match", keeps: "Keeps the kind of hook, the format, the kind of offer, the order of the beats and where the call to action sits." },
  ],
};

const BREAKDOWN = {
  title: "BrightSmile: the two-minute first visit",
  advertiser: "BrightSmile Dental",
  lengthSeconds: 22,
  format: "Talking head with clinic shots",
  hook: { type: "worry question", words: "Still putting it off?" },
  beats: [
    { seconds: "0-3", what: "Names the worry" },
    { seconds: "3-15", what: "Walks through the visit" },
    { seconds: "15-22", what: "States the offer and asks for the booking" },
  ],
  onScreenText: ["Still putting it off?", "New patients welcome"],
  spoken: "",
  offer: "New patient check-up",
  cta: { words: "Book today", placement: "last 3 seconds" },
  audience: "Adults who avoid the dentist",
};

const REFERENCES: AddedReference[] = [
  { id: id("ref1"), origin: "link", platform: "youtube", mediaKind: "video", url: "https://www.youtube.com/watch?v=abc", title: BREAKDOWN.title, status: "ready", problem: null, breakdown: BREAKDOWN, costCents: 1, createdAt: AT },
  { id: id("ref2"), origin: "upload", platform: "upload", mediaKind: "video", url: null, title: "competitor-reel.mp4", status: "analysing", problem: null, breakdown: null, costCents: 0, createdAt: AT },
  { id: id("ref3"), origin: "upload", platform: "upload", mediaKind: "image", url: null, title: "static-ad.png", status: "failed", problem: "Nothing in it could be read as an ad.", breakdown: null, costCents: 1, createdAt: AT },
];

const variation = (key: string, hookType: string, hook: string, primaryText: string, hypothesis: string) => ({
  key,
  hookType,
  hook,
  primaryText,
  headline: "A gentler first visit",
  cta: "Book a check-up",
  imageDirection: "A bright, calm treatment room in natural light. No people. Teal accent on a sand background.",
  hypothesis,
  design: { eyebrow: "For nervous patients", kicker: "The first visit, step by step", accent: "first visit", visual: "A calm dental chair with three small numbered steps beside it.", labels: ["Say hello", "Gentle check", "Clear plan"], subline: "No rushing. No lectures.", },
});

function view(status: CreativeView["status"], test: CreativeView["test"] = null): CreativeView {
  const passed = status !== "needsReview";
  return {
    assetId: id("a1"),
    model: { family: "gemini", name: "Gemini 4 Carbon" },
    title: 'Northside Dental: ad set from "BrightSmile: nervous about the dentist?"',
    status,
    createdAt: AT,
    versions: passed ? 1 : 2,
    dial: OPTIONS.dials[1],
    kit: { id: "k2", name: "Northside Dental", kind: "client", version: 2 },
    reference: { sourceRefId: "s1", referenceId: null, title: "BrightSmile: nervous about the dentist?", url: "https://www.facebook.com/ads/library/?id=1", platform: "metaAdLibrary", publisher: "BrightSmile Dental" },
    offer: { cardId: "o1", name: "New patient check-up", version: 2 },
    disclaimers: ["Results vary by patient."],
    creative: {
      summary: "Four ads that open on the worry most new patients carry and close on an easy first booking.",
      structure: { hookType: "worry question", format: "short vertical video", beats: ["name the worry", "show the calm room", "state the offer", "book"], offerType: "first-visit price", ctaPlacement: "last beat" },
      brief: { audience: "Adults who have put off the dentist", promise: "A first visit that is calm and unhurried", angle: "You are not the only one who dreads this", tone: "Warm and plain-spoken" },
      variations: [
        variation("A", "Worry question", "Been putting off the dentist?", "Most of our new patients had. Your first visit is a slow, gentle check-up with time for every question.", "A question about avoidance earns more clicks than a statement."),
        variation("B", "Reassurance", "Your first visit, at your pace.", "No rushing and no lectures. We explain each step before we take it.", "Reassurance up front beats naming the worry."),
        variation("C", "Offer first", "A new patient check-up for $59.", "A full check-up and a plain-language plan. Same-day times most weekdays.", "Leading with the price brings in more bookings per click."),
        variation("D", "Family", "One calm dentist for the whole family.", "From first teeth to grandparents, booked together if you like.", "A family angle reaches parents the other three miss."),
      ],
      script: {
        beats: [
          { seconds: "0-3", voiceover: "Been putting off the dentist?", onScreen: "You are not the only one" },
          { seconds: "3-10", voiceover: "A first visit here is slow and gentle, with time for every question.", onScreen: "A gentler first visit" },
          { seconds: "10-15", voiceover: "New patient check-ups are $59. Book a time that suits you.", onScreen: "Book a check-up" },
        ],
      },
      captions: ["Putting it off is normal. Booking is easier than you think.", "A calm room, a clear plan, and time for your questions."],
      claims: passed ? [{ text: "A new patient check-up for $59.", support: "offer", factIds: [] }] : [],
      limits: ["No patient results are on record, so none are stated."],
      contextUsed: { profileVersionId: "p1", factIds: [] },
    },
    test,
    checks: {
      passed,
      results: [
        { id: 1, name: "Four complete variations", passed: true, detail: "Four variations, each with its own hook and what it tests." },
        { id: 2, name: "New words, not the reference's", passed: true, detail: "The wording is new. Only the structure follows the reference." },
        { id: 3, name: "On brand", passed: true, detail: "The copy keeps to the brand's rules and names no other business." },
        { id: 4, name: "Fits the placements", passed: true, detail: "Every field fits its placement." },
        { id: 5, name: "Claims are backed", passed, detail: passed ? "Every result, price and promise in the copy is backed." : 'These state a result, a price or a promise with nothing on record behind them: "A new patient check-up for $59.". Back each with a verified fact or the offer, or reword it.' },
        { id: 6, name: "Used the business context", passed: true, detail: "The context used is real." },
        { id: 7, name: "Within the cost cap", passed: true, detail: "The run stayed within its cost cap." },
      ],
    },
  };
}

/** A plain picture with no text, so the story needs no network. */
const picture = (from: string, to: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="300" cy="110" r="70" fill="#ffffff" opacity="0.35"/></svg>`)}`;
const LOGO = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 40"><circle cx="20" cy="20" r="16" fill="#0f8b8d"/><text x="44" y="27" font-family="Arial" font-size="18" font-weight="700" fill="#12263a">Northside</text></svg>')}`;

const IMAGES: CreativeImageList = {
  eachCents: { photo: 16, designed: 42 },
  brand: { name: "Northside Dental", accent: "#0f8b8d", headingFont: "Poppins", logoUrl: LOGO },
  images: [
    { id: id("i1"), variationKey: "A", placement: "1:1", look: "photo", status: "ready", stale: false, url: picture("#f2e9dc", "#0f8b8d"), problem: null },
    { id: id("i2"), variationKey: "A", look: "photo", placement: "9:16", status: "ready", stale: false, url: picture("#dff3f1", "#12263a"), problem: null },
    { id: id("i3"), variationKey: "A", look: "photo", placement: "1.91:1", status: "ready", stale: false, url: picture("#f2e9dc", "#12263a"), problem: null },
    { id: id("i4"), variationKey: "B", look: "photo", placement: "1:1", status: "generating", stale: false, url: null, problem: null },
    { id: id("i5"), variationKey: "B", look: "photo", placement: "9:16", status: "failed", stale: false, url: null, problem: "The image service declined to make this one. Try again, or edit the image direction." },
  ],
};

const FIGURES = { source: "meta" as const, label: "Meta ads", currency: "USD", dateStart: "2026-10-10", dateStop: "2026-11-08", spend: 1200, conversions: 31, capturedAt: AT };
const TEST = { id: id<NonNullable<CreativeView["test"]>["id"]>("t1"), assetId: id<CreativeView["assetId"]>("a1"), title: "Northside Dental: ad set", checkInAt: AT - 86_400_000, createdAt: AT - 15 * 86_400_000, due: true, baseline: [FIGURES], outcome: null };

/** The Creative workspace with fixture data. `state`: full, review (did not pass), empty, rep, form, running, approved, due, won, edit. */
export function CreativeTabStory({ state, theme }: { state: string; theme: string }) {
  const empty = state === "empty" || state === "form";
  const live = state === "approved" || state === "due" || state === "won";
  const status: CreativeView["status"] = state === "review" ? "needsReview" : live ? "approved" : "draft";
  const test: CreativeView["test"] =
    state === "due"
      ? TEST
      : state === "won"
        ? { ...TEST, due: false, outcome: { result: "better", winner: { key: "B", hookType: "walk-through", hook: view(status).creative!.variations[1].hook, headline: "A gentler first visit" }, note: "B got twice the bookings of the others.", recordedAt: AT, changes: [{ source: "meta", label: "Meta ads", metric: "conversions", before: 31, after: 44, percent: 41.9 }] } }
        : null;
  const tab: CreativeTabData = {
    running: state === "running" ? [{ id: id("r1"), startedAt: AT, costCents: 12, stepsDone: 1, words: "Writing the brief and four variations" }] : [],
    results: empty ? [] : [{ id: id("a1"), title: "Ad set", status, createdAt: AT, brand: "Northside Dental", reference: "BrightSmile", offer: "New patient check-up", test: state === "due" ? "due" : state === "won" ? "recorded" : null }],
    stopped: state === "running" ? [{ id: id("r0"), status: "failed", stopReason: "error", startedAt: AT - 86_400_000 }] : [],
  };
  return (
    <StoryFrame theme={theme} role={state === "rep" ? "viewer" : "owner"}>
      <CreativeTabView
        base="/app/agents/growth-architect"
        editor={state !== "rep"}
        model={{ options: SAMPLE_MODELS, value: "gemini" }}
        options={OPTIONS}
        references={state === "form" ? REFERENCES : []}
        referenceActions={{ addLink: async () => null, upload: async () => null, remove: noop }}
        tab={tab}
        view={empty ? null : view(status, test)}
        onSelect={() => undefined}
        onStart={noop}
        review={{ approve: noop, reject: noop, requestChanges: noop }}
        test={{ start: noop, record: noop, remove: noop }}
        onEdit={async () => ({ passed: true })}
        initialEdit={state === "edit" ? "A" : null}
        initialSource={state === "form" ? "s1" : null}
        images={
          <CreativeImagesView
            editor={state !== "rep"}
            variations={view(status).creative!.variations.map((row) => ({ key: row.key, headline: row.headline, cta: row.cta }))}
            placements={["1:1", "9:16", "1.91:1"]}
            onPlacements={() => undefined}
            look="designed"
            onLook={() => undefined}
            tone="dark"
            onTone={() => undefined}
            style={state === "approved" ? "fresh" : "brand"}
            onStyle={() => undefined}
            quote={{ look: "designed", looks: [{ value: "designed", label: "Designed ad", what: "The whole ad is drawn with your words in it, then read back to check every word.", eachCents: 42 }, { value: "photo", label: "Photo with text on top", what: "A picture with no words. Your headline, button and real logo file are placed on top.", eachCents: 16 }], styleRefs: 2, styles: [{ value: "brand", label: "Like your past ads", what: "Follows the look of the 2 ads saved in your brand kit." }, { value: "fresh", label: "New design", what: "A new layout for each variation, in your colours and fonts. Your past ads are not shown to the designer. Your words stay exactly as written." }], count: 12, eachCents: 42, totalCents: 504, variations: 4, placements: ["1:1", "9:16", "1.91:1"], kitPlacements: ["1:1", "9:16"], availableCents: state === "review" ? 40 : 14_250, canAfford: state !== "review", blocked: state === "review" ? "This ad set did not pass its checks. Fix it before spending on images." : null }}
            list={state === "running" ? { ...IMAGES, images: [] } : IMAGES}
            onGenerate={noop}
            onRetake={noop}
          />
        }
      />
    </StoryFrame>
  );
}
