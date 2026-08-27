import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/**
 * Headline and form recipes for the public site. Mapped onto Vistrial tokens.
 * Geist for UI copy, Cal Sans for titles, brand-500, ink-950.
 *
 * Scale is meant to sit with dense dark-SaaS marketing pages: large type,
 * rectangle buttons with round corners, not compact newsletter chrome.
 */

export const marketingHeroTitle =
  "font-heading text-[2.25rem] leading-[1.08] tracking-tight text-white sm:text-5xl md:text-[3.25rem] md:leading-[1.05]";

export const marketingSectionTitle =
  "font-heading max-w-3xl text-2xl tracking-tight text-white sm:text-[2rem] sm:leading-tight";

export const marketingSubhead = "text-[15px] leading-relaxed text-silver sm:text-lg";

export const marketingLead = "max-w-2xl text-[15px] leading-relaxed text-silver sm:text-base";

export const marketingBody = "text-sm leading-relaxed text-silver sm:text-[15px]";

export const marketingCardTitle = "font-heading text-[15px] tracking-tight text-white sm:text-base";

export const marketingNavLink =
  "rounded-md px-2.5 py-1.5 text-sm font-medium text-silver transition-colors hover:text-white focus-visible:text-white";

/** Marketing CTAs share the coss button recipes. */
export const marketingBtnBase = buttonVariants({ variant: "gradient", size: "lg" });

export const marketingBtnPrimary = buttonVariants({ variant: "gradient", size: "lg" });

export const marketingBtnSecondary = buttonVariants({ variant: "outline", size: "lg" });

export const marketingBtnPrimarySm = buttonVariants({ variant: "primary", size: "sm" });

export const marketingTextLink =
  "inline-flex items-center gap-1.5 text-sm font-medium text-silver transition-colors hover:text-white";

/** DA QualifyGate labels: sentence case, white, tight tracking — not the app's uppercase dim labels. */
export const marketingFormLabel =
  "inline-flex items-center gap-2 font-medium text-base/4.5 text-card-foreground sm:text-sm/4";

export const marketingField = cn(
  "relative rounded-lg border border-white/[0.09]",
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.02)_100%),#100f18]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors",
  "focus-within:border-brand-500/55 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_3px_rgba(154,136,252,0.12)]"
);

export const marketingFieldControl = cn(
  "block w-full min-h-11 border-0 bg-transparent px-4 py-2.5",
  "text-sm font-medium tracking-tight text-white",
  "placeholder:font-medium placeholder:text-silver/70",
  "focus:outline-none"
);

export const marketingFieldSelect = `${marketingFieldControl} cursor-pointer appearance-none pr-10`;

export const marketingFieldCompact = cn(
  "relative rounded-md border border-transparent",
  "bg-white/[0.04] transition-colors",
  "focus-within:bg-white/[0.06] focus-within:ring-2 focus-within:ring-brand-500/40"
);

export const marketingFieldCompactControl = cn(
  "block w-full min-h-10 border-0 bg-transparent px-3.5 py-2",
  "text-sm font-medium tracking-tight text-white",
  "placeholder:font-medium placeholder:text-silver/55",
  "focus:outline-none"
);

export const marketingPageGutter = "px-5 sm:px-6 lg:px-8";

export const marketingSectionY = "py-16 sm:py-24";

export const marketingShell = "mx-auto max-w-6xl";

export const marketingMeasure = "max-w-2xl";

export const marketingMeasureWide = "max-w-3xl";
