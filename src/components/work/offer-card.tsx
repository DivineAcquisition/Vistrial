"use client";

import { forwardRef } from "react";

import { ArrowRight, Check, Megaphone, ShieldCheck, Sparkles, Target, Users, X } from "@/components/icons";
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
 * The offer card: a premium, printable summary of one offer. Its own colours come from the theme tokens,
 * so it reads in light and dark and exports as it looks. The builder draws it live as a person types, so
 * an unfilled part says what goes there (`draft`) rather than "Not stated".
 */
export const OfferCardView = forwardRef<HTMLDivElement, { offer: OfferContent; version?: number; origin?: OfferVersion["origin"]; at?: number; draft?: boolean; className?: string }>(function OfferCardView(
  { offer, version, origin, at, draft = false, className },
  ref,
) {
  const pricing = offer.pricing;
  const total = itemsTotal(offer.items);
  const items = offer.items.length ? offer.items : offer.included.map((text) => ({ text, value: "" }));
  return (
    <div ref={ref} className={cn("relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/60 via-primary/20 to-primary/50 p-px", className)}>
      <div className="relative grid gap-5 rounded-[calc(1.5rem-1px)] bg-card p-5 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-20 size-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 flex-1 basis-52 gap-1">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Offer</p>
            <h3 className="font-heading text-xl break-words text-card-foreground sm:text-2xl">{offer.name || <Missing text={draft ? "Your offer's name" : undefined} />}</h3>
            {offer.outcome ? (
              <p className="flex items-start gap-1.5 text-sm text-card-foreground">
                <Target aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                <span className="min-w-0 break-words">{offer.outcome}</span>
              </p>
            ) : draft ? (
              <p className="text-sm">
                <Missing text="The outcome they get" />
              </p>
            ) : null}
          </div>
          <div className="grid min-w-0 justify-items-start gap-0.5 sm:justify-items-end">
            {pricing?.kind === "tiered" && pricing.tiers.length ? (
              <ul className="grid gap-1">
                {pricing.tiers.map((tier) => (
                  <li key={`${tier.name}-${tier.price}`} className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-muted-foreground">{tier.name}</span>
                    <span className="font-heading text-lg text-card-foreground tabular-nums">{tier.price}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-2">
                {pricing?.was ? <s className="text-sm text-muted-foreground tabular-nums">{pricing.was}</s> : null}
                <span className="font-heading text-2xl break-words text-card-foreground tabular-nums sm:text-3xl">{offer.price || <Missing text={draft ? "Price" : undefined} />}</span>
              </span>
            )}
            {pricing ? <span className="text-[11px] text-muted-foreground">{PRICE_KIND_WORDS[pricing.kind]} price</span> : null}
            {version ? (
              <span className="text-[11px] text-muted-foreground">
                Version {version}
                {at ? ` · ${shortDate(at)}` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="relative grid gap-2">
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs font-medium text-muted-foreground">
            <span>What&apos;s included</span>
            {total ? <span className="tabular-nums">{total} total value</span> : null}
          </p>
          {items.length ? (
            <ul className="grid gap-1.5">
              {items.map((item) => (
                <li key={item.text} className="flex items-start gap-2 text-sm text-card-foreground">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check aria-hidden className="size-3" />
                  </span>
                  <span className="min-w-0 flex-1 break-words">{item.text}</span>
                  {item.value ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.value} value</span> : null}
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
          <div className="relative grid gap-2">
            <p className="text-xs font-medium text-muted-foreground">Bonuses</p>
            <ul className="flex flex-wrap gap-1.5">
              {offer.bonuses.map((bonus) => (
                <li key={bonus} className="inline-flex max-w-full items-start gap-1.5 rounded-full border border-primary/25 bg-primary/[0.07] px-2.5 py-1 text-xs text-card-foreground">
                  <Sparkles aria-hidden className="mt-px size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 break-words">{bonus}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="relative grid gap-3 sm:grid-cols-2">
          <div className="grid content-start gap-1 rounded-2xl border border-border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShieldCheck aria-hidden className="size-3.5 text-primary" /> {offer.guaranteeType ? GUARANTEE_WORDS[offer.guaranteeType] : "Guarantee"}
            </p>
            {offer.guaranteeType === "none" ? <p className="text-sm text-muted-foreground">None offered.</p> : <p className="text-sm break-words text-card-foreground">{offer.guarantee || <Missing />}</p>}
          </div>
          <div className="grid content-start gap-1 rounded-2xl border border-border bg-muted/30 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users aria-hidden className="size-3.5 text-primary" /> For
            </p>
            <p className="text-sm break-words text-card-foreground">{offer.targetCustomer || <Missing />}</p>
          </div>
        </div>
        {offer.cta || offer.channel ? (
          <div className="relative flex flex-wrap items-center gap-x-3 gap-y-2">
            {offer.cta ? (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground">
                <span className="min-w-0 break-words">{offer.cta}</span> <ArrowRight aria-hidden className="size-3.5 shrink-0" />
              </span>
            ) : null}
            {offer.channel ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Megaphone aria-hidden className="size-3.5 shrink-0 text-primary" /> <span className="min-w-0 break-words">Offered through {offer.channel}</span>
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs">
          <span className="min-w-0 break-words text-muted-foreground">
            <span className="font-medium text-card-foreground">Terms:</span> {offer.terms || "Not stated"}
          </span>
          {origin ? <span className="text-muted-foreground">{ORIGIN_WORDS[origin]}</span> : null}
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
