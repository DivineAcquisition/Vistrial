import { AgentAvatar } from "@/components/live/agent-avatar";
import Image from "next/image";
import Link from "next/link";

import { Check, CheckCircle2, Minus } from "@/components/icons";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  COMPARE,
  CTA,
  FIXES,
  LIVE,
  OFFER,
  PAINS,
  PICTURE_NOTE,
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
          <p className="mt-auto flex items-center gap-2 pt-4 text-xs text-muted-foreground">
            <span className="live-pulse size-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
            {FIXES.handledBy} <span className="font-medium text-strong">{fix.by}</span>
          </p>
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
      <div className="flex items-center gap-3 border-b border-border bg-muted px-3 py-2">
        <span className="flex shrink-0 items-center gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-foreground/15" />
          <span className="size-2 rounded-full bg-brand-400" />
        </span>
        <p className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs text-muted-foreground">
          <span className="live-pulse size-1.5 shrink-0 rounded-full bg-brand-400" aria-hidden />
          {picture.place === "fix" ? <AgentAvatar name={LIVE.agent} size="xs" className="size-5" /> : null}
          <span className="truncate">
            {picture.place === "fix" ? LIVE.agent : LIVE.app} · <span className="font-medium text-strong">{picture.by}</span>
          </span>
        </p>
      </div>
      <div className={cn("relative overflow-hidden", crop)}>
        {/* On a phone the picture is shown larger and cut at the right edge, so its words stay readable. */}
        <Image src={`/marketing/product/${picture.file}.png`} alt={picture.alt} {...shared} className={cn("h-auto sm:w-full", picture.phone === "fit" ? "w-full" : "w-[200%] max-w-none")} />
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
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className={eyebrow}>
              {OFFER.eyebrow} · {OFFER.name}
            </p>
            <p className="flex items-center gap-2 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <span className="live-pulse size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
              <AgentAvatar name={LIVE.agent} size="xs" className="size-5" />
              <span className="font-medium text-strong">{LIVE.agent}</span>
              {LIVE.status}
            </p>
          </div>
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
