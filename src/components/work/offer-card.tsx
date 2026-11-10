"use client";

import { forwardRef } from "react";

import { ArrowRight, Check, Megaphone, ShieldCheck, Sparkles, X } from "@/components/icons";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { GUARANTEE_WORDS, PRICE_KIND_WORDS, itemsTotal, type OfferContent } from "../../../convex/lib/offerCards";

import type { OfferComparison, OfferVersion } from "./types";

export type { OfferContent };

const ORIGIN_WORDS: Record<OfferVersion["origin"], string> = { person: "You edited", chat: "From your chat", analysis: "From an offer analysis" };

function Missing({ text = "Not stated" }: { text?: string }) {
  return <span className="text-muted-foreground italic">{text}</span>;
}

/**
 * The offer card: the outcome as the headline and what is included on the left; a price panel on the right
 * with the price, the guarantee and the call to action (stacked under it when the card is narrow). It reads
 * in light and dark and exports as it looks. The builder draws it live as a person types, so an unfilled
 * part says what goes there (`draft`) rather than "Not stated".
 */
export const OfferCardView = forwardRef<HTMLDivElement, { offer: OfferContent; version?: number; origin?: OfferVersion["origin"]; at?: number; draft?: boolean; className?: string }>(function OfferCardView(
  { offer, version, origin, at, draft = false, className },
  ref,
) {
  const pricing = offer.pricing;
  const total = itemsTotal(offer.items);
  const items = offer.items.length ? offer.items : offer.included.map((text) => ({ text, value: "" }));
  const tiered = pricing?.kind === "tiered" && pricing.tiers.length > 0;
  // The outcome is the headline when there is one; the offer's name sits under it.
  const headline = offer.outcome || offer.name;
  return (
    <div ref={ref} className={cn("@container overflow-hidden rounded-3xl border border-border bg-card", className)}>
      <div className="grid @xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-5 p-5 sm:p-7">
          <div className="grid gap-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] break-words text-muted-foreground uppercase">{offer.targetCustomer ? `For ${offer.targetCustomer}` : draft ? "Who it is for" : "Offer"}</p>
            <h3 className="font-heading text-2xl leading-tight break-words text-card-foreground @xl:text-[1.75rem]">{headline || <Missing text={draft ? "The outcome they get" : undefined} />}</h3>
            {offer.outcome ? <p className="text-sm break-words text-muted-foreground">{offer.name || <Missing text={draft ? "Your offer's name" : undefined} />}</p> : draft && offer.name ? <p className="text-sm"><Missing text="The outcome they get" /></p> : null}
          </div>
          <div className="grid gap-2">
            <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-medium text-muted-foreground">
              <span>What&apos;s included</span>
              {total ? <span className="tabular-nums">{total} total value</span> : null}
            </p>
            {items.length ? (
              <ul className="grid gap-2">
                {items.map((item) => (
                  <li key={item.text} className="flex items-start gap-2 text-sm text-card-foreground">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 break-words">{item.text}</span>
                    {item.value ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.value}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">
                <Missing text={draft ? "Line items show here" : undefined} />
              </p>
            )}
          </div>
          {offer.bonuses.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Bonuses">
              {offer.bonuses.map((bonus) => (
                <li key={bonus} className="inline-flex max-w-full items-start gap-1.5 rounded-full bg-primary/[0.12] px-3 py-1 text-xs font-medium text-card-foreground">
                  <Sparkles aria-hidden className="mt-px size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 break-words">Bonus: {bonus}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-auto min-w-0 text-xs leading-relaxed break-words text-muted-foreground">
            <span className="font-medium text-card-foreground">Terms:</span> {offer.terms || "Not stated"}
          </p>
        </div>
        {/* The price panel, in theme tokens: the card's ink as its ground on a light page, a raised surface on a dark one. */}
        <div className="grid content-start gap-4 bg-card-foreground p-5 text-card sm:p-7 dark:bg-muted dark:text-card-foreground">
          <div className="grid gap-1.5">
            <p className="text-xs opacity-70">
              {pricing ? `${PRICE_KIND_WORDS[pricing.kind]} price` : "Price"}
              {pricing?.was ? (
                <>
                  {" · was "}
                  <s>{pricing.was}</s>
                </>
              ) : null}
            </p>
            {tiered ? (
              <ul className="grid gap-1.5">
                {pricing.tiers.map((tier) => (
                  <li key={`${tier.name}-${tier.price}`} className="flex items-baseline justify-between gap-4 border-b border-current/15 pb-1.5 last:border-0">
                    <span className="min-w-0 text-sm break-words opacity-80">{tier.name}</span>
                    <span className="font-heading text-xl tabular-nums">{tier.price}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-heading text-4xl leading-none font-semibold tracking-tight break-words tabular-nums @xl:text-5xl">{offer.price || <span className="text-2xl opacity-60 italic">{draft ? "Price" : "Not stated"}</span>}</p>
            )}
            {total ? <p className="text-xs opacity-70">{total} of work included</p> : null}
          </div>
          <div className="grid gap-1.5 rounded-2xl border border-current/20 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-success uppercase">
              <ShieldCheck aria-hidden className="size-4" /> {offer.guaranteeType ? GUARANTEE_WORDS[offer.guaranteeType] : "Guarantee"}
            </p>
            <p className="text-sm leading-snug break-words">{offer.guaranteeType === "none" ? "None offered." : offer.guarantee || <span className="opacity-60 italic">Not stated</span>}</p>
          </div>
          {offer.cta ? (
            <span className="mt-auto flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
              <span className="min-w-0 break-words">{offer.cta}</span> <ArrowRight aria-hidden className="size-4 shrink-0" />
            </span>
          ) : draft ? (
            <span className="mt-auto flex min-h-11 items-center justify-center rounded-xl border border-dashed border-current/30 px-4 text-sm opacity-60 italic">Call to action</span>
          ) : null}
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-[11px] opacity-70">
            {offer.channel ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <Megaphone aria-hidden className="size-3.5 shrink-0" /> <span className="break-words">Offered through {offer.channel}</span>
              </span>
            ) : null}
            {version ? (
              <span>
                {offer.channel ? "· " : ""}Version {version}
                {at ? `, ${shortDate(at)}` : ""}
              </span>
            ) : null}
            {origin ? <span>· {ORIGIN_WORDS[origin]}</span> : null}
          </p>
        </div>
      </div>
    </div>
  );
});

/** Two versions side by side: each field before and after, changed ones highlighted. */
export function OfferCompareView({ comparison }: { comparison: OfferComparison }) {
  const changed = comparison.changes.filter((row) => row.changed).length;
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">
        Version {comparison.from.version} → version {comparison.to.version}: {changed === 0 ? "no changes" : `${changed} field${changed === 1 ? "" : "s"} changed`}
        {comparison.to.note ? <span className="text-card-foreground"> · &ldquo;{comparison.to.note}&rdquo;</span> : null}
      </p>
      <dl className="grid gap-2">
        {comparison.changes.map((row) => (
          <div key={row.field} className={cn("grid gap-2 rounded-xl border p-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)]", row.changed ? "border-primary/40 bg-primary/[0.05]" : "border-border")}>
            <dt className="text-xs font-medium text-muted-foreground">{row.label}</dt>
            {"added" in row ? (
              <>
                <dd className="text-sm text-muted-foreground">{row.before.join(", ") || "Not stated"}</dd>
                <dd className="grid gap-1 text-sm text-card-foreground">
                  {row.after.join(", ") || "Not stated"}
                  {row.added.length ? <span className="text-xs text-success">+ {row.added.join(", ")}</span> : null}
                  {row.removed.length ? (
                    <span className="flex items-center gap-1 text-xs text-destructive">
                      <X aria-hidden className="size-3" /> {row.removed.join(", ")}
                    </span>
                  ) : null}
                </dd>
              </>
            ) : (
              <>
                <dd className={cn("text-sm break-words", row.changed ? "text-muted-foreground line-through decoration-muted-foreground/50" : "text-muted-foreground")}>{row.before || "Not stated"}</dd>
                <dd className={cn("text-sm break-words", row.changed ? "font-medium text-card-foreground" : "text-muted-foreground")}>{row.after || "Not stated"}</dd>
              </>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Saves the card as a PNG, drawn from the card as it looks on screen. */
export async function exportOfferImage(node: HTMLElement, name: string) {
  const { toPng } = await import("html-to-image");
  const background = getComputedStyle(document.body).backgroundColor;
  const url = await toPng(node, { pixelRatio: 2, backgroundColor: background, cacheBust: true });
  download(url, `${fileName(name)}.png`);
}

/** Saves the card as a one-page PDF, drawn with react-pdf in the browser. */
export async function exportOfferPdf(offer: OfferContent, version: number | undefined) {
  const [{ pdf }, { OfferCardPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./offer-card-pdf")]);
  const blob = await pdf(<OfferCardPdf offer={offer} version={version} />).toBlob();
  const url = URL.createObjectURL(blob);
  download(url, `${fileName(offer.name)}.pdf`);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function fileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "offer";
}

function download(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
