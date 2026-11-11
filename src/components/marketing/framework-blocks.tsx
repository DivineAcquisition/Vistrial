import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { ArrowRight, Check, CheckCircle2, Clock, Minus, RefreshCw } from "@/components/icons";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COMPARE,
  CTA,
  FIXES,
  LOOP,
  OFFER,
  PAINS,
  PICTURE_NOTE,
  PROCESS,
  ROLES,
  SCARCITY,
  type Picture,
} from "@/lib/marketing/landing";
import { cn } from "@/lib/utils";

/**
 * The building blocks of the framework page. Each block has one job, named in
 * docs/rebuild/landing-page-framework.md. Colours come from the marketing tokens. The public site is
 * white only, so nothing here has a dark variant.
 */

const eyebrow = "text-[11px] font-semibold tracking-[0.14em] text-brand-200 uppercase";
const ctaButton = "h-12! rounded-[8px]! before:rounded-[7px]!";

/** The one button. `position` is recorded with the click and the request. */
export function CtaButton({ position, className, size = "xl" }: { position: "nav" | "hero" | "offer" | "final"; className?: string; size?: "lg" | "xl" }) {
  return (
    <Button
      variant="gradient"
      size={size}
      className={cn(ctaButton, className)}
      render={<Link href={`${CTA.href}?from=${position}`} data-cta-position={position} />}
    >
      {CTA.label}
    </Button>
  );
}

/** Hero, layer one: who this is for, and the line they have to be over. */
export function QualifierBadge({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto inline-flex max-w-full items-center gap-2.5 rounded-full border border-brand-500/35 bg-brand-500/10 py-1.5 pr-4 pl-3 text-left text-[13px] leading-snug font-medium text-strong sm:text-sm">
      <span aria-hidden className="relative flex size-2 shrink-0">
        <span className="absolute inline-flex size-full rounded-full bg-brand-500 opacity-60 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-brand-500" />
      </span>
      {children}
    </p>
  );
}

export function ScarcityNote({ className }: { className?: string }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{SCARCITY}</p>;
}

/* ---------------------------------------------------------------------------
 * Problem and solution: two grids with the same shape, so the eye can pair
 * card 03 above with card 03 below.
 * ------------------------------------------------------------------------- */

const mirroredGrid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
const cardNumber = "font-heading text-xs tabular-nums";

export function ProblemGrid() {
  return (
    <ol className={mirroredGrid}>
      {PAINS.items.map((pain, index) => (
        <li key={pain.id} className="flex flex-col rounded-xl border border-border bg-muted p-5">
          <span className={cn(cardNumber, "text-muted-foreground")} aria-hidden>
            {String(index + 1).padStart(2, "0")}
          </span>
          <p className="mt-3 mb-5 text-[15px] leading-relaxed text-strong">{pain.moment}</p>
          <p className="mt-auto flex flex-col gap-0.5 border-t border-dashed border-border pt-3 text-flag-warning">
            <span className="text-[10px] font-semibold tracking-[0.14em] uppercase">{PAINS.costLabel}</span>
            <span className="text-sm font-medium">{pain.cost}</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

export function SolutionGrid() {
  return (
    <ol className={mirroredGrid}>
      {FIXES.items.map((fix, index) => (
        <li key={fix.id} className="flex flex-col rounded-xl border border-brand-500/30 bg-card p-5 shadow-[0_16px_40px_-28px_rgba(var(--brand-rgb),0.55)]">
          <span className="flex items-center justify-between">
            <span className={cn(cardNumber, "text-brand-300")} aria-hidden>
              {String(index + 1).padStart(2, "0")}
            </span>
            <CheckCircle2 className="size-4 text-flag-good" aria-hidden />
          </span>
          <p className="mt-3 font-heading text-lg leading-snug tracking-tight text-strong">{fix.outcome}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{fix.detail}</p>
        </li>
      ))}
    </ol>
  );
}

const LABEL_VARIANT: Record<string, NonNullable<BadgeProps["variant"]>> = {
  observed: "success",
  inferred: "info",
  hypothesis: "warning",
  firstParty: "default",
  insufficient: "outline",
};

/** The philosophy and the evidence labels, as support for the fixes rather than a stop of their own. */
export function PrincipleNote() {
  const { principle } = FIXES;
  return (
    <aside aria-label={principle.title} className="grid gap-6 rounded-xl border border-border bg-muted p-5 sm:p-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
      <div>
        <p className={eyebrow}>{principle.maxim}</p>
        <p className="mt-2 font-heading text-2xl tracking-tight text-strong">{principle.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{principle.body}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{principle.labelsTitle}</p>
        <ul className="mt-3 grid gap-2">
          {principle.labels.map((label) => (
            <li key={label.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <Badge variant={LABEL_VARIANT[label.id]} size="sm" className="normal-case">
                {label.label}
              </Badge>
              <span>{label.body}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------------------------
 * The loop: study, propose, you approve, try, measure, and round again.
 * ------------------------------------------------------------------------- */

export function LoopDiagram() {
  return (
    <figure className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <figcaption className={eyebrow}>{LOOP.title}</figcaption>
      <ol className="mt-5 grid gap-2 lg:grid-cols-5 lg:gap-0">
        {LOOP.steps.map((step, index) => {
          const yours = step.by === "you";
          return (
            <li key={step.id} className="relative flex gap-3 lg:flex-col lg:gap-0 lg:pr-4">
              {/* The line that joins one step to the next: down the side on a phone, along the top on a desktop. */}
              <span aria-hidden className={cn("absolute bg-border", "top-9 bottom-[-0.5rem] left-[17px] w-px lg:top-[17px] lg:right-0 lg:bottom-auto lg:left-9 lg:h-px lg:w-auto", index === LOOP.steps.length - 1 && "hidden")} />
              <span
                className={cn(
                  "relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border font-heading text-sm tabular-nums",
                  yours ? "border-brand-500 bg-brand-500 text-primary-foreground" : "border-brand-500/40 bg-card text-brand-300",
                )}
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="min-w-0 pb-4 lg:mt-3 lg:pb-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-base tracking-tight text-strong">{step.name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase", yours ? "bg-brand-500/15 text-brand-300" : "bg-muted text-muted-foreground")}>
                    {LOOP.who[step.by]}
                  </span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-5 flex items-center gap-2 border-t border-dashed border-border pt-4 text-sm text-strong">
        <RefreshCw className="size-4 shrink-0 text-brand-300" aria-hidden />
        {LOOP.again}
      </p>
    </figure>
  );
}

/* ---------------------------------------------------------------------------
 * Product pictures: real screens only.
 * ------------------------------------------------------------------------- */

/** `crop` keeps the top of a tall screen and fades the rest, so pictures in one row share a height. */
export function ProductPicture({
  picture,
  className,
  crop,
  sizes = "(min-width: 1024px) 560px, 100vw",
}: {
  picture: Picture;
  className?: string;
  crop?: string;
  sizes?: string;
}) {
  if (!picture.on || !picture.file) return null;
  const shared = { width: picture.width, height: picture.height, sizes };
  return (
    <figure className={cn("flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[0_24px_50px_-32px_rgba(11,10,17,0.45)]", className)}>
      <div className="flex items-center gap-1.5 border-b border-border bg-muted px-3 py-2" aria-hidden>
        <span className="size-2 rounded-full bg-foreground/15" />
        <span className="size-2 rounded-full bg-foreground/15" />
        <span className="size-2 rounded-full bg-brand-400" />
      </div>
      <div className={cn("relative overflow-hidden", crop)}>
        {/* On a phone the picture is shown larger and cut at the right edge, so its words stay readable. */}
        <Image src={`/marketing/product/${picture.file}.png`} alt={picture.alt} {...shared} className="h-auto w-[200%] max-w-none sm:w-full" />
        {crop ? <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" /> : null}
      </div>
      <figcaption className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-t border-border px-4 py-3">
        <span className="text-sm font-medium text-strong">{picture.title}</span>
        <span className="text-xs text-muted-foreground">{PICTURE_NOTE}</span>
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------------------
 * The offer: the one boxed thing on the page.
 * ------------------------------------------------------------------------- */

export function OfferBox() {
  return (
    <div className="relative rounded-2xl bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 p-[2px] shadow-[0_40px_80px_-40px_rgba(var(--brand-rgb),0.75)]">
      <div className="grid overflow-hidden rounded-[14px] bg-card lg:grid-cols-[1.25fr_0.75fr]">
        <div className="p-6 sm:p-9">
          <p className={eyebrow}>
            {OFFER.eyebrow} · {OFFER.name}
          </p>
          <h2 id="offer-title" className="mt-3 font-heading text-[1.75rem] leading-tight tracking-tight text-strong sm:text-4xl sm:leading-[1.12]">
            {OFFER.headline}
          </h2>
          <h3 className="mt-7 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{OFFER.deliverablesTitle}</h3>
          <ul className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {OFFER.deliverables.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-strong">
                <Check className="mt-1 size-3.5 shrink-0 text-brand-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-7 border-l-2 border-brand-500 pl-4 font-heading text-lg leading-snug tracking-tight text-strong">{OFFER.effort}</p>
        </div>
        {/* The price panel is the page's one inverted surface: white type on ink. */}
        <div className="flex flex-col justify-between gap-8 bg-strong p-6 text-background sm:p-9">
          <div>
            <p className="flex items-baseline gap-2">
              <span className="font-heading text-6xl tracking-tight">{OFFER.price}</span>
              <span className="text-base opacity-80">{OFFER.per}</span>
            </p>
            <p className="mt-3 text-base font-medium">{OFFER.credits}</p>
            <p className="mt-2 text-sm leading-relaxed opacity-75">{OFFER.creditsNote}</p>
          </div>
          <div>
            <CtaButton position="offer" className="w-full" />
            <p className="mt-4 text-sm leading-relaxed opacity-80">{OFFER.access}</p>
            <p className="mt-1 text-sm leading-relaxed opacity-80">{OFFER.noCharge}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * With vs without: matched pairs, one row each.
 * ------------------------------------------------------------------------- */

export function WithWithout() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="hidden grid-cols-2 sm:grid" aria-hidden>
        <p className="border-b border-border bg-muted px-5 py-3 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{COMPARE.without}</p>
        <p className="border-b border-l border-brand-500/30 bg-brand-500/10 px-5 py-3 text-xs font-semibold tracking-[0.14em] text-brand-300 uppercase">{COMPARE.with}</p>
      </div>
      <ul>
        {COMPARE.rows.map((row) => (
          <li key={row.topic} className="grid border-b border-border last:border-b-0 sm:grid-cols-2">
            <div className="bg-muted px-5 py-4">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {row.topic}
                <span className="sm:sr-only"> · {COMPARE.without}</span>
              </p>
              <p className="mt-1.5 flex gap-2.5 text-[15px] leading-relaxed text-muted-foreground">
                <Minus className="mt-1.5 size-3.5 shrink-0 text-flag-warning" aria-hidden />
                {row.without}
              </p>
            </div>
            <div className="border-brand-500/30 bg-card px-5 py-4 sm:border-l">
              <p className="text-[11px] font-semibold tracking-[0.12em] text-brand-300 uppercase">
                <span className="sr-only sm:not-sr-only">{row.topic}</span>
                <span className="sm:sr-only">{COMPARE.with}</span>
                <span className="sr-only"> · {COMPARE.with}</span>
              </p>
              <p className="mt-1.5 flex gap-2.5 text-[15px] leading-relaxed font-medium text-strong">
                <Check className="mt-1.5 size-3.5 shrink-0 text-flag-good" aria-hidden />
                {row.with}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Process: a numbered line. The reader's time sits apart from the step.
 * ------------------------------------------------------------------------- */

export function ProcessLine() {
  return (
    <ol className="relative">
      <span aria-hidden className="absolute top-5 bottom-5 left-5 w-px bg-border" />
      {PROCESS.steps.map((step, index) => (
        <li key={step.title} className="relative grid gap-x-6 gap-y-3 pb-6 pl-16 last:pb-0 sm:grid-cols-[1fr_13rem] sm:items-center">
          <span className="absolute top-0 left-0 z-10 flex size-10 items-center justify-center rounded-full border border-brand-500/40 bg-card font-heading text-base text-brand-300 tabular-nums" aria-hidden>
            {index + 1}
          </span>
          <div>
            <h3 className="font-heading text-lg tracking-tight text-strong sm:text-xl">{step.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{step.body}</p>
          </div>
          <p className="flex items-center gap-2.5 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3.5 py-2.5">
            <Clock className="size-4 shrink-0 text-brand-300" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold tracking-[0.14em] text-brand-300 uppercase">{PROCESS.timeLabel}</span>
              <span className="block text-sm font-medium text-strong">{step.time}</span>
            </span>
          </p>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------------------
 * Roles: two columns of unequal size. The imbalance is the message.
 * ------------------------------------------------------------------------- */

export function RolesBlock() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[0.55fr_1.45fr]">
      <div className="rounded-xl border border-border bg-muted p-5 sm:p-6">
        <h3 className="flex items-baseline justify-between gap-3">
          <span className="font-heading text-xl tracking-tight text-strong">{ROLES.yours.title}</span>
          <span className="font-heading text-sm text-muted-foreground tabular-nums" aria-hidden>{ROLES.yours.items.length}</span>
        </h3>
        <ul className="mt-4 grid gap-2.5">
          {ROLES.yours.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-strong">
              <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-brand-500/35 bg-card p-5 shadow-[0_24px_60px_-36px_rgba(var(--brand-rgb),0.7)] sm:p-6">
        <h3 className="flex items-baseline justify-between gap-3">
          <span className="font-heading text-xl tracking-tight text-strong">{ROLES.ours.title}</span>
          <span className="font-heading text-sm text-brand-300 tabular-nums" aria-hidden>{ROLES.ours.items.length}</span>
        </h3>
        <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {ROLES.ours.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-strong">
              <Check className="mt-1 size-3.5 shrink-0 text-brand-400" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
