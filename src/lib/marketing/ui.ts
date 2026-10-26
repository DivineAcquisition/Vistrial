import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/**
 * Headline and form recipes for the public site. Mapped onto Vistrial tokens.
 * Inter Display for titles and UI copy — the same face as the operator app —
 * brand-500, ink-950.
 *
 * Scale follows the landing page: centered hero, large type,
 * rectangular buttons with rounded corners.
 */

export const marketingHeroTitle =
  "font-heading text-[2.25rem] leading-[1.08] tracking-tight text-strong sm:text-5xl md:text-[3.25rem] md:leading-[1.05]";

/** Landing hero only — larger than inner marketing pages. */
export const marketingDisplayTitle =
  "font-heading text-[2.6rem] leading-[1.05] tracking-tight text-strong sm:text-6xl sm:leading-[1.04] md:text-[4.25rem] md:leading-[1.02]";

export const marketingSectionTitle =
  "font-heading max-w-3xl text-[1.75rem] leading-tight tracking-tight text-strong sm:text-4xl sm:leading-[1.12]";

export const marketingSubhead = "text-[15px] leading-relaxed text-muted-foreground sm:text-lg";

export const marketingLead = "max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-base";

export const marketingBody = "text-sm leading-relaxed text-muted-foreground sm:text-[15px]";

export const marketingCardTitle =
  "font-heading text-lg tracking-tight text-strong sm:text-xl";

export const marketingNavLink =
  "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-strong focus-visible:text-strong";

/** Marketing CTAs share the coss button recipes. */
export const marketingBtnBase = buttonVariants({ variant: "gradient", size: "lg" });

export const marketingBtnPrimary = buttonVariants({ variant: "gradient", size: "lg" });

export const marketingBtnSecondary = buttonVariants({ variant: "outline", size: "lg" });

export const marketingBtnPrimarySm = buttonVariants({ variant: "primary", size: "sm" });

export const marketingTextLink =
  "inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-strong";

/** DA QualifyGate labels: sentence case, white, tight tracking — not the app's uppercase dim labels. */
export const marketingFormLabel =
  "inline-flex items-center gap-2 font-medium text-base/4.5 text-card-foreground sm:text-sm/4";

export const marketingField = cn(
  "relative rounded-lg border border-border bg-background",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors",
  "focus-within:border-brand-500/55 focus-within:shadow-[0_0_0_3px_rgba(154,136,252,0.18)]"
);

export const marketingFieldControl = cn(
  "block w-full min-h-11 border-0 bg-transparent px-4 py-2.5",
  "text-sm font-medium tracking-tight text-strong",
  "placeholder:font-medium placeholder:text-muted-foreground/70",
  "focus:outline-none"
);

export const marketingFieldSelect = `${marketingFieldControl} cursor-pointer appearance-none pr-10`;

export const marketingFieldCompact = cn(
  "relative rounded-md border border-transparent",
  "bg-muted transition-colors",
  "focus-within:bg-background focus-within:ring-2 focus-within:ring-brand-500/40"
);

export const marketingFieldCompactControl = cn(
  "block w-full min-h-10 border-0 bg-transparent px-3.5 py-2",
  "text-sm font-medium tracking-tight text-strong",
  "placeholder:font-medium placeholder:text-muted-foreground/70",
  "focus:outline-none"
);

/** Solid marketing surfaces. A hairline and a soft fill keep them off the white page. */
export const marketingPanel = "rounded-xl border border-border bg-card shadow-[0_16px_40px_-28px_rgba(11,10,17,0.28)]";
export const marketingInset = "rounded-lg border border-border bg-muted";

export const marketingPageGutter = "px-5 sm:px-6 lg:px-8";

export const marketingSectionY = "py-20 sm:py-28";

export const marketingShell = "mx-auto max-w-6xl";

export const marketingMeasure = "max-w-2xl";

export const marketingMeasureWide = "max-w-3xl";
