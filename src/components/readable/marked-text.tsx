import { HIGHLIGHT_WORDS, type HighlightKind, type Segment } from "@/lib/readable/highlight";
import { cn } from "@/lib/utils";

export type MarkStyle = "underline" | "tag";

/** Each kind has its own line style as well as its own colour, so two kinds differ without colour. */
const LINE: Record<HighlightKind, string> = {
  pain: "bg-destructive/10 decoration-destructive decoration-wavy",
  fix: "bg-success/10 decoration-success decoration-solid",
  proof: "bg-info/10 decoration-info decoration-double",
  cta: "bg-primary/10 decoration-primary decoration-solid",
  qualifier: "bg-primary/10 decoration-primary decoration-dashed",
  price: "bg-warning/15 decoration-warning decoration-dotted",
};
const TAG: Record<HighlightKind, string> = {
  pain: "bg-destructive/12 text-destructive-foreground",
  fix: "bg-success/12 text-success-foreground",
  proof: "bg-info/12 text-info-foreground",
  cta: "bg-primary/12 text-primary",
  qualifier: "bg-primary/12 text-primary",
  price: "bg-warning/15 text-warning-foreground",
};

function Tag({ kind }: { kind: HighlightKind }) {
  return <span className={cn("mr-1 inline-block rounded-[4px] px-1 align-[0.08em] text-[10px] font-semibold tracking-wide uppercase", TAG[kind])}>{HIGHLIGHT_WORDS[kind].name}</span>;
}

/**
 * Text with its highlights drawn. The segments come from markText, which only marks words found in the text.
 * A screen reader hears the kind before the marked words.
 */
export function MarkedText({ segments, look = "underline" }: { segments: Segment[]; look?: MarkStyle }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind ? (
          <mark key={index} title={HIGHLIGHT_WORDS[segment.kind].name} className={cn("rounded-[3px] box-decoration-clone px-0.5 text-inherit underline decoration-2 underline-offset-[3px]", LINE[segment.kind], look === "tag" && "no-underline")}>
            {look === "tag" ? <Tag kind={segment.kind} /> : <span className="sr-only">{HIGHLIGHT_WORDS[segment.kind].name}: </span>}
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/** The legend: only the kinds that are really marked nearby, each drawn the way it is drawn in the text. */
export function HighlightLegend({ kinds, look = "underline", className }: { kinds: readonly HighlightKind[]; look?: MarkStyle; className?: string }) {
  if (kinds.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground", className)} role="group" aria-label="What the highlights mean">
      <span className="font-medium text-card-foreground">Highlights:</span>
      {kinds.map((kind) => (
        <span key={kind} title={HIGHLIGHT_WORDS[kind].means} className="inline-flex items-center gap-1">
          <mark className={cn("rounded-[3px] px-1 text-card-foreground underline decoration-2 underline-offset-[3px]", LINE[kind], look === "tag" && "no-underline")}>{look === "tag" ? <Tag kind={kind} /> : null}{HIGHLIGHT_WORDS[kind].name}</mark>
        </span>
      ))}
      <span>They mark the page&apos;s own words where the teardown quoted them.</span>
    </div>
  );
}
