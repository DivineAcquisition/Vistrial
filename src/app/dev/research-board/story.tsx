"use client";

import { BoardView } from "@/components/research/board";
import type { BoardSource } from "@/components/research/source-card";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
const NOW = 1793800000000;

const SOURCES: BoardSource[] = [
  {
    id: "s1",
    platform: "youtube",
    kind: "video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    title: "Full home deep cleaning transformation",
    publisher: "Sparkly Maid Austin",
    publishedAt: NOW - 40 * DAY,
    observedAt: NOW,
    embed: { provider: "youtube", id: "dQw4w9WgXcQ" },
    availability: "available",
    excerpt: "Watch our team take a lived-in Austin home from cluttered to spotless in one visit.",
    limitation: null,
    classification: { hook: "Dramatic before and after", offer: "Not visible", callToAction: "Book a deep clean", format: "Long video", audienceHypothesis: "Busy homeowners", relevance: "high" },
  },
  {
    id: "s2",
    platform: "tiktok",
    kind: "short",
    url: "https://www.tiktok.com/@team/video/6718335390845095173",
    title: "Move-out clean, ready for the next tenant",
    publisher: "family-run team",
    publishedAt: null,
    observedAt: NOW,
    embed: { provider: "tiktok", id: "6718335390845095173" },
    availability: "available",
    excerpt: null,
    limitation: null,
    classification: { hook: "Kitchen to baseboards in 30 seconds", offer: "Not visible", callToAction: "Not visible", format: "Short video", audienceHypothesis: "Renters moving out", relevance: "medium" },
  },
  {
    id: "s3",
    platform: "web",
    kind: "page",
    url: "https://www.mollymaid.com/greater-austin/",
    title: "Molly Maid of Greater Austin",
    publisher: "Molly Maid",
    publishedAt: null,
    observedAt: NOW,
    embed: null,
    availability: "linkOnly",
    excerpt: "Trusted cleaning professionals serving the Austin area for over 40 years.",
    limitation: null,
    classification: { hook: "Trusted for 40 years", offer: "Not visible", callToAction: "Get a free estimate", format: "Landing page", audienceHypothesis: "Families wanting reliability", relevance: "high" },
  },
  {
    id: "s4",
    platform: "instagram",
    kind: "post",
    url: "https://www.instagram.com/p/C0abcdefghi/",
    title: "https://www.instagram.com/p/C0abcdefghi/",
    publisher: null,
    publishedAt: null,
    observedAt: NOW - 2 * DAY,
    embed: null,
    availability: "linkOnly",
    excerpt: null,
    limitation: "Instagram previews are waiting for Meta to approve the app. Links are shown instead.",
    classification: null,
  },
  {
    id: "s5",
    platform: "metaAdLibrary",
    kind: "ad",
    url: "https://www.facebook.com/ads/library/?id=1234567890",
    title: "Meta ad 1234567890",
    publisher: null,
    publishedAt: null,
    observedAt: NOW,
    embed: null,
    availability: "linkOnly",
    excerpt: null,
    limitation: null,
    classification: null,
  },
  {
    id: "s6",
    platform: "web",
    kind: "page",
    url: "https://austincleaningcrew.example.com/",
    title: "It's not magic, it's the checklist",
    publisher: "Austin Cleaning Crew",
    publishedAt: NOW - 120 * DAY,
    observedAt: NOW,
    embed: null,
    availability: "linkOnly",
    excerpt: "Every clean follows the same 60-point checklist, so you know exactly what you get.",
    limitation: null,
    classification: { hook: "Process over promises", offer: "Not visible", callToAction: "See the checklist", format: "Landing page", audienceHypothesis: "Detail-minded homeowners", relevance: "high" },
  },
];

/** The Research Board from fake data. Development only. */
export function ResearchBoardStory({ width, focus }: { width?: string; focus: string[] }) {
  return (
    <div className="grid min-h-screen gap-6 bg-background p-4 sm:p-8">
      <p className="mx-auto w-full max-w-3xl rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Research Board story page. Fake data, development only. Add ?width=390 or ?focus=s1,s3.
      </p>
      <div className={cn("mx-auto w-full max-w-6xl", width === "390" && "max-w-[390px]", width === "320" && "max-w-[320px]")}>
        <BoardView
          sources={SOURCES}
          loading={false}
          canLoadMore={false}
          onLoadMore={() => {}}
          collections={[
            { id: "c1", name: "Pricing ideas", shared: true, items: 2 },
            { id: "c2", name: "My favourites", shared: false, items: 1 },
          ]}
          collectionFilter=""
          onCollectionFilter={() => {}}
          inCollection={new Set()}
          onCreate={async () => "c3"}
          onSave={async () => null}
          canShare
          focus={focus}
        />
      </div>
    </div>
  );
}
