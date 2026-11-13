"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Check, Download, FileImage, LoaderCircle, Sparkles } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { showError } from "@/lib/errors/show-error";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PLACEMENTS, PLACEMENT_WORDS, type Placement } from "../../../convex/lib/brandKits";
import type { Look, Tone } from "../../../convex/lib/creativeImages";

import type { CreativeImageList, CreativeImageQuote } from "./types";
import { SectionTitle } from "./work-shell";
import { useCredits } from "@/lib/credits";
import { ModelMark } from "@/components/models/model-mark";
import { ModelSwitch } from "@/components/models/model-switch";
import { Banner } from "@/components/ui/banner";

type VariationCopy = { key: string; headline: string; cta: string };
type ImageRow = CreativeImageList["images"][number];
type Brand = CreativeImageList["brand"];

export type CreativeImagesProps = {
  editor: boolean;
  variations: VariationCopy[];
  placements: Placement[];
  onPlacements: (placements: Placement[]) => void;
  /** How the picture is made: the whole ad drawn with its words, or a photo with the words placed on top. */
  look: Look;
  onLook: (look: Look) => void;
  tone: Tone;
  onTone: (tone: Tone) => void;
  /** The price of the placements and the look chosen. Null while it is being read. */
  quote: CreativeImageQuote | null;
  list: CreativeImageList | null;
  /** Makes one image per variation per placement, for the total the person was shown. */
  onGenerate: (placements: Placement[], confirmedCents: number) => Promise<void>;
  /** Makes one image again, for the price of one. */
  onRetake: (variationKey: string, placement: Placement, confirmedCents: number) => Promise<void>;
};

const ASPECT: Record<Placement, string> = { "1:1": "1 / 1", "4:5": "4 / 5", "9:16": "9 / 16", "16:9": "16 / 9", "1.91:1": "1.91 / 1" };
/** A finished ad's own colours. It is an ad, not a workspace screen, so it does not follow the theme. */
const AD_INK = "#ffffff";
const AD_PAPER = "rgba(255, 255, 255, 0.95)";
/** The width a finished ad is saved at, in pixels. */
const EXPORT_WIDTH = 1080;

/**
 * One finished ad: the picture, with the headline, the button and the brand's real logo placed on top here,
 * so the words are exact and the logo is the file the business uploaded.
 */
function Composed({ image, copy, brand, placement, node }: { image: ImageRow; copy: VariationCopy; brand: Brand; placement: Placement; node?: React.Ref<HTMLDivElement> }) {
  const wide = placement === "16:9" || placement === "1.91:1";
  return (
    <div ref={node} className="relative w-full overflow-hidden rounded-xl bg-muted" style={{ aspectRatio: ASPECT[placement] }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a generated file from storage, drawn as it is */}
      {image.url ? <img src={image.url} alt="" crossOrigin="anonymous" className="absolute inset-0 size-full object-cover" /> : null}
      <div aria-hidden className={cn("absolute inset-0", wide ? "bg-gradient-to-r from-black/70 via-black/30 to-transparent" : "bg-gradient-to-t from-black/75 via-black/20 to-transparent")} />
      {brand.logoUrl ? (
        <span className="absolute top-[4%] left-[4%] block rounded-md p-[1.5%]" style={{ backgroundColor: AD_PAPER, width: wide ? "22%" : "34%" }}>
          {/* The whole logo is always shown: its width is set and its height follows, so nothing is cut off. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- the business's own logo file, placed as uploaded */}
          <img src={brand.logoUrl} alt={`${brand.name} logo`} crossOrigin="anonymous" className="block h-auto max-h-[22cqw] w-full object-contain" />
        </span>
      ) : null}
      <div style={{ color: AD_INK }} className={cn("absolute grid gap-[6%]", wide ? "inset-y-0 left-[5%] w-[52%] content-center" : "inset-x-[6%] bottom-[7%]")}>
        <p className="leading-tight font-semibold text-balance" style={{ fontFamily: brand.headingFont ? `"${brand.headingFont}", var(--font-heading), sans-serif` : undefined, fontSize: "clamp(0.8rem, 5.5cqw, 2.4rem)" }}>
          {copy.headline}
        </p>
        {copy.cta ? (
          <span className="w-fit rounded-full px-[5%] py-[2%] font-medium" style={{ color: AD_INK, backgroundColor: brand.accent ?? "#111827", fontSize: "clamp(0.6rem, 3.4cqw, 1.3rem)" }}>
            {copy.cta}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Tile({ image, copy, brand, placement, editor, eachCents, onRetake }: { image: ImageRow; copy: VariationCopy; brand: Brand; placement: Placement; editor: boolean; eachCents: number; onRetake: () => Promise<void> }) {
  const credits = useCredits();
  const node = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"save" | "retake" | null>(null);
  const [asking, setAsking] = useState(false);

  const save = async () => {
    if (!node.current) return;
    setBusy("save");
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(node.current, { pixelRatio: EXPORT_WIDTH / node.current.offsetWidth, cacheBust: true });
      const link = document.createElement("a");
      link.href = url;
      link.download = `${brand.name.replace(/[^\w]+/g, "-").toLowerCase()}-${copy.key}-${placement.replace(/[:.]/g, "x")}.png`;
      link.click();
    } catch (error) {
      showError(error, "The finished ad could not be saved. Open the picture on its own and save that.");
    } finally {
      setBusy(null);
    }
  };

  const retake = () => {
    setBusy("retake");
    void onRetake()
      .catch((error: unknown) => void showError(error, "The image was not started."))
      .finally(() => {
        setBusy(null);
        setAsking(false);
      });
  };

  return (
    <li className="grid content-start gap-2" style={{ containerType: "inline-size" }}>
      {image.status === "generating" && !image.url ? (
        <div className="flex w-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground" style={{ aspectRatio: ASPECT[placement] }}>
          <LoaderCircle aria-hidden className="mr-2 size-4 animate-spin text-primary motion-reduce:animate-none" /> Making it
        </div>
      ) : image.url && image.look === "designed" ? (
        <div ref={node} className="w-full overflow-hidden rounded-xl bg-muted" style={{ aspectRatio: ASPECT[placement] }}>
          {/* The words are part of this picture, and each was read back and checked when it was made. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a generated file from storage, drawn as it is */}
          <img src={image.url} alt={`Designed ad for variation ${copy.key}: ${copy.headline}`} crossOrigin="anonymous" className="size-full object-cover" />
        </div>
      ) : image.url ? (
        <Composed node={node} image={image} copy={copy} brand={brand} placement={placement} />
      ) : (
        <div className="flex w-full items-center justify-center rounded-xl border border-dashed border-border p-3 text-center text-xs text-destructive" style={{ aspectRatio: ASPECT[placement] }}>
          {image.problem ?? "This image could not be made."}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <span className="mr-auto grid gap-0.5">
          <span>
            {PLACEMENT_WORDS[placement]} {placement}
            {image.status === "generating" && image.url ? " · making a new one" : ""}
          </span>
          <ModelMark model={image.model} />
        </span>
        {image.url ? (
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void save()}>
            <Download aria-hidden className="size-4" /> {busy === "save" ? "Saving…" : "Save"}
          </Button>
        ) : null}
        {editor && image.status !== "generating" ? (
          asking ? (
            <>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={retake}>
                {busy === "retake" ? "Starting…" : `Spend ${credits.words(eachCents)}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setAsking(true)}>
              Try again · {credits.words(eachCents)}
            </Button>
          )
        ) : null}
      </div>
    </li>
  );
}

/** Images for an ad set: choose the placements, see the price, confirm, then the finished ads. */
export function CreativeImagesView({ editor, variations, placements, onPlacements, look, onLook, tone, onTone, quote, list, onGenerate, onRetake }: CreativeImagesProps) {
  const credits = useCredits();
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState("");
  const images = list?.images ?? [];
  const making = images.some((row) => row.status === "generating");

  const start = () => {
    if (!quote) return;
    setStarting(true);
    setProblem("");
    void onGenerate(placements, quote.totalCents)
      .then(() => setConfirming(false))
      .catch((error: unknown) => setProblem(showError(error, "The images were not started.")))
      .finally(() => setStarting(false));
  };

  return (
    <section className="grid gap-3" aria-label="Images">
      <SectionTitle icon={FileImage}>Images</SectionTitle>
      <p className="text-xs text-muted-foreground">Pictures carry an invisible AI watermark from the image model. Nothing from the ad you modelled this on goes into them.</p>

      {editor ? (
        <div className="grid gap-3 rounded-xl border border-border p-3">
          {quote ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedRadioGroup
                  aria-label="How the picture is made"
                  value={look}
                  onValueChange={(value) => {
                    setConfirming(false);
                    onLook(value as Look);
                  }}
                  options={quote.looks.map((row) => ({ value: row.value, label: `${row.label} · ${credits.words(row.eachCents)}` }))}
                />
                {/* Which model makes the picture. Only a family that really makes images here can be chosen. */}
                <ModelSwitch options={quote.models.options} value={quote.models.value} />
                {look === "designed" ? (
                  <SegmentedRadioGroup
                    aria-label="Background"
                    value={tone}
                    onValueChange={(value) => onTone(value as Tone)}
                    options={[
                      { value: "dark", label: "Dark" },
                      { value: "light", label: "Light" },
                    ]}
                  />
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {quote.looks.find((row) => row.value === look)?.what}
                {look === "designed" ? (quote.styleRefs > 0 ? ` Following ${quote.styleRefs} of your own ads from the brand kit.` : " Add a few of your own past ads to the brand kit and designed ads will follow their look.") : ""}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Placements to make">
            {PLACEMENTS.map((placement) => {
              const on = placements.includes(placement);
              return (
                <button
                  key={placement}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setConfirming(false);
                    onPlacements(on ? placements.filter((row) => row !== placement) : PLACEMENTS.filter((row) => row === placement || placements.includes(row)));
                  }}
                  className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors", on ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground")}
                >
                  {on ? <Check aria-hidden className="size-3.5" /> : null}
                  {PLACEMENT_WORDS[placement]} <span className="text-xs text-muted-foreground">{placement}</span>
                </button>
              );
            })}
          </div>
          {placements.length === 0 ? <p className="text-sm text-muted-foreground">Choose at least one placement.</p> : null}
          {placements.length > 0 && !quote ? <p className="text-sm text-muted-foreground">Working out the price.</p> : null}
          {quote?.setup ? (
            // Checked before anything is started: no button is offered, so nothing can be charged.
            <Banner tone="warning" role="status" title={quote.setup.admin ? "Image making is not set up" : "Images are not available yet"}>
              {quote.setup.words}
            </Banner>
          ) : null}
          {placements.length > 0 && quote && quote.count > 0 && !quote.setup ? (
            <>
              <p className="text-sm text-card-foreground">
                {quote.count} image{quote.count === 1 ? "" : "s"}: {quote.variations} variations × {quote.placements.length} placement{quote.placements.length === 1 ? "" : "s"}. <span className="font-medium">{credits.words(quote.totalCents)} of credits</span>{" "}
                <span className="text-muted-foreground">({credits.words(quote.eachCents)} each, charged only for images that are delivered)</span>
              </p>
              {quote.blocked ? <p className="text-sm text-warning">{quote.blocked}</p> : null}
              {!quote.blocked && !quote.canAfford ? (
                <p className="text-sm text-warning">
                  Your balance does not cover this{quote.availableCents !== null ? ` (${credits.words(Math.max(0, quote.availableCents))} available)` : ""}. Choose fewer placements, or{" "}
                  <Link href="/app/billing" className="underline underline-offset-4">
                    add credits
                  </Link>
                  .
                </p>
              ) : null}
              {problem ? (
                <p role="alert" className="text-sm text-destructive">
                  {problem}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                {confirming ? (
                  <>
                    <Button size="sm" disabled={starting} onClick={start}>
                      {starting ? "Starting…" : `Spend ${credits.words(quote.totalCents)} and make them`}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={starting} onClick={() => setConfirming(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button size="sm" disabled={Boolean(quote.blocked) || !quote.canAfford || making} onClick={() => setConfirming(true)}>
                    <Sparkles aria-hidden className="size-4" /> {making ? "Making images…" : images.length > 0 ? "Make these again" : "Make the images"}
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {list && images.length > 0
        ? variations.map((copy) => {
            const mine = images.filter((row) => row.variationKey === copy.key);
            if (mine.length === 0) return null;
            return (
              <div key={copy.key} className="grid gap-2">
                <h4 className="flex items-center gap-2 text-sm text-card-foreground">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{copy.key}</span>
                  {copy.headline}
                </h4>
                <ul className="grid grid-cols-2 items-start gap-3 md:grid-cols-3 lg:grid-cols-4">
                  {PLACEMENTS.filter((placement) => mine.some((row) => row.placement === placement)).map((placement) => {
                    const image = mine.find((row) => row.placement === placement)!;
                    return <Tile key={image.id} image={image} copy={copy} brand={list.brand} placement={placement} editor={editor} eachCents={list.eachCents[image.look]} onRetake={() => onRetake(copy.key, placement, list.eachCents[image.look])} />;
                  })}
                </ul>
              </div>
            );
          })
        : null}
      {!editor && images.length === 0 ? <p className="text-sm text-muted-foreground">No images have been made for this ad set.</p> : null}
    </section>
  );
}

/** The images of one ad set, fed by Convex. Starts on the placements the brand kit names. */
export function CreativeImages({ workspaceId, assetId, editor, variations }: { workspaceId: Id<"workspaces">; assetId: Id<"assets">; editor: boolean; variations: VariationCopy[] }) {
  const [chosen, setChosen] = useState<Placement[] | null>(null);
  const [look, setLook] = useState<Look>("designed");
  const [tone, setTone] = useState<Tone>("dark");
  const first = useQuery(api.creativeImages.quote, { workspaceId, assetId, placements: [], look });
  const placements = chosen ?? (first ? (first.kitPlacements.length > 0 ? first.kitPlacements : (["1:1"] as Placement[])) : []);
  const quote = useQuery(api.creativeImages.quote, placements.length > 0 ? { workspaceId, assetId, placements, look } : "skip");
  const list = useQuery(api.creativeImages.list, { workspaceId, assetId });
  const generate = useMutation(api.creativeImages.generate);
  return (
    <CreativeImagesView
      editor={editor}
      variations={variations}
      placements={placements}
      onPlacements={setChosen}
      look={look}
      onLook={setLook}
      tone={tone}
      onTone={setTone}
      quote={placements.length > 0 ? (quote ?? null) : (first ?? null)}
      list={list ?? null}
      onGenerate={async (rows, confirmedCents) => {
        await generate({ workspaceId, assetId, placements: rows, confirmedCents, look, tone });
      }}
      onRetake={async (variationKey, placement, confirmedCents) => {
        await generate({ workspaceId, assetId, placements: [], confirmedCents, only: { variationKey, placement } });
      }}
    />
  );
}
