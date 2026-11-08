"use client";

import { ExternalLink, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import { embedShape, embedUrl, type Embed } from "@/lib/research/embeds";
import { PLATFORM_LABEL, shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";

export type BoardSource = {
  id: string;
  platform: string;
  kind: string;
  url: string;
  title: string;
  publisher: string | null;
  publishedAt: number | null;
  observedAt: number;
  embed: Embed | null;
  availability: string;
  excerpt: string | null;
  limitation: string | null;
  classification: {
    hook?: string;
    offer?: string;
    callToAction?: string;
    format?: string;
    audienceHypothesis?: string;
    relevance?: "high" | "medium" | "low";
  } | null;
};

const KIND_WORDS: Record<string, string> = {
  page: "Page",
  video: "Video",
  short: "Short video",
  post: "Post",
  reel: "Reel",
  ad: "Ad",
  dataset: "Your data",
};

const AVAILABILITY_WORDS: Record<string, string> = {
  available: "",
  linkOnly: "Shown as a link. The platform does not allow a preview here.",
  unavailable: "Not available. It may be private or removed.",
  removed: "No longer available.",
};

const RELEVANCE_TONE = { high: "good", medium: "warning", low: "neutral" } as const;

/** Click to load: the player is built only when a person asks for it. */
function Player({ embed, kind, title }: { embed: Embed; kind: string; title: string }) {
  const [on, setOn] = useState(false);
  const src = embedUrl(embed, kind);
  if (!src) return null;
  const shape = embedShape(embed, kind);
  if (!on) {
    return (
      <button
        type="button"
        onClick={() => setOn(true)}
        className={cn(
          "grid w-full place-items-center rounded-lg border border-border bg-muted text-sm text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          shape,
          "max-h-56",
        )}
      >
        <span className="flex items-center gap-2">
          <Play aria-hidden className="size-4" /> Load the {PLATFORM_LABEL[embed.provider]} player
        </span>
      </button>
    );
  }
  return (
    <iframe
      src={src}
      title={title}
      className={cn("w-full rounded-lg border border-border", shape)}
      loading="lazy"
      allow="encrypted-media; picture-in-picture; fullscreen"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
    />
  );
}

/**
 * One source on the board. What the source shows (title, excerpt, dates) is kept apart from the agent's
 * reading of it (hook, offer, call to action), which is labeled as the agent's and never as fact.
 */
export function SourceCard({
  source,
  comparing,
  onCompare,
  compareFull,
  saveSlot,
  highlighted,
}: {
  source: BoardSource;
  comparing: boolean;
  onCompare: (on: boolean) => void;
  compareFull: boolean;
  saveSlot?: React.ReactNode;
  highlighted?: boolean;
}) {
  const reading = source.classification;
  // Web pages and Ad Library entries are always links, so "no preview" only means something for video and post platforms.
  const embeddable = source.platform === "youtube" || source.platform === "tiktok" || source.platform === "instagram";
  const note = source.availability === "linkOnly" && !embeddable ? "" : (AVAILABILITY_WORDS[source.availability] ?? "");
  return (
    <article
      aria-labelledby={`src-${source.id}`}
      className={cn("grid min-w-0 content-start gap-3 rounded-xl border border-border bg-card p-4", highlighted && "ring-2 ring-brand-500")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={PLATFORM_LABEL[source.platform] ?? source.platform} tone="brand" className="[&_span]:normal-case" />
        <span className="text-xs text-muted-foreground">{reading?.format || KIND_WORDS[source.kind] || source.kind}</span>
        {reading?.relevance ? (
          <StatusBadge label={`${reading.relevance} relevance`} tone={RELEVANCE_TONE[reading.relevance]} className="ml-auto [&_span]:normal-case" />
        ) : null}
      </div>
      <h3 id={`src-${source.id}`} className="text-sm font-medium break-words text-card-foreground">
        {source.title}
      </h3>
      {source.publisher ? <p className="-mt-2 text-xs text-muted-foreground">{source.publisher}</p> : null}

      {source.embed && source.availability === "available" ? <Player embed={source.embed} kind={source.kind} title={source.title} /> : null}
      {source.excerpt ? <blockquote className="border-l-2 border-border pl-3 text-sm break-words text-muted-foreground">{source.excerpt}</blockquote> : null}

      {reading ? (
        <div className="grid gap-1.5 rounded-lg bg-muted/50 p-3">
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">The agent&apos;s reading</p>
          <dl className="grid gap-1 text-xs">
            {(
              [
                ["Hook", reading.hook],
                ["Offer", reading.offer],
                ["Call to action", reading.callToAction],
                ["Audience (a guess)", reading.audienceHypothesis],
              ] as const
            )
              .filter(([, value]) => value && value.toLowerCase() !== "not visible")
              .map(([label, value]) => (
                <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-2">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words text-card-foreground">{value}</dd>
                </div>
              ))}
          </dl>
        </div>
      ) : null}

      {note || source.limitation ? <p className="text-xs text-muted-foreground">{source.limitation ?? note}</p> : null}
      <p className="text-xs text-muted-foreground">
        Seen {shortDate(source.observedAt)}
        {source.publishedAt ? ` · published ${shortDate(source.publishedAt)}` : ""}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={comparing} disabled={!comparing && compareFull} onCheckedChange={(checked) => onCompare(checked === true)} />
          Compare
        </label>
        {saveSlot}
        <Button variant="ghost" size="sm" className="ml-auto" render={<a href={source.url} target="_blank" rel="noreferrer noopener" />}>
          Open source <ExternalLink aria-hidden className="size-3.5" />
        </Button>
      </div>
    </article>
  );
}
