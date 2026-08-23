import { cn } from "@/lib/utils";

/**
 * Headline and form recipes for the public site. Mapped onto Vistrial tokens.
 * No new colours or faces — Inter, brand-500, ink-950.
 */

export const marketingHeroTitle =
  "text-[1.75rem] font-semibold leading-[1.12] tracking-tight text-white sm:text-[2.25rem] md:text-[2.5rem] md:leading-[1.1]";

export const marketingSectionTitle =
  "max-w-2xl text-xl font-semibold tracking-tight text-white sm:text-2xl";

export const marketingSubhead = "text-sm leading-relaxed text-silver sm:text-[15px]";

export const marketingLead = "max-w-2xl text-sm leading-relaxed text-silver sm:text-[15px]";

export const marketingBody = "text-[13px] leading-relaxed text-silver sm:text-sm";

export const marketingCardTitle = "text-sm font-semibold tracking-tight text-white";

export const marketingNavLink =
  "rounded-md px-2.5 py-1.5 text-[13px] font-medium text-silver transition-colors hover:text-white focus-visible:text-white";

/** Marketing CTAs: rectangle with round corners. Do not use the app pill recipes here. */
export const marketingBtnBase =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors duration-150 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500/80 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0";

export const marketingBtnPrimary = `${marketingBtnBase} h-9 px-3.5 bg-brand-500 text-ink-950 hover:bg-brand-400`;

export const marketingBtnSecondary = `${marketingBtnBase} h-9 px-3.5 border border-white/[0.12] bg-transparent text-white hover:border-white/25 hover:bg-white/[0.04]`;

export const marketingBtnPrimarySm = `${marketingBtnBase} h-8 px-3 bg-brand-500 text-ink-950 hover:bg-brand-400`;

/** DA QualifyGate labels: sentence case, white, tight tracking — not the app's uppercase dim labels. */
export const marketingFormLabel = "block text-[13px] font-semibold tracking-tight text-white";

export const marketingField = cn(
  "relative rounded-lg border border-white/[0.09]",
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.02)_100%),#100f18]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors",
  "focus-within:border-brand-500/55 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_3px_rgba(154,136,252,0.12)]"
);

export const marketingFieldControl = cn(
  "block w-full min-h-11 border-0 bg-transparent px-3 py-2",
  "text-[13px] font-medium tracking-tight text-white",
  "placeholder:font-medium placeholder:text-silver/70",
  "focus:outline-none"
);

export const marketingFieldSelect = `${marketingFieldControl} cursor-pointer appearance-none pr-10`;

export const marketingFieldCompact = cn(
  "relative rounded-lg border border-white/[0.1]",
  "bg-white/[0.03] transition-colors",
  "focus-within:border-brand-500/55 focus-within:shadow-[0_0_0_3px_rgba(154,136,252,0.12)]"
);

export const marketingFieldCompactControl = cn(
  "block w-full min-h-9 border-0 bg-transparent px-3 py-2",
  "text-[13px] font-medium tracking-tight text-white",
  "placeholder:font-medium placeholder:text-silver/55",
  "focus:outline-none"
);

export const marketingPageGutter = "px-5 sm:px-6";

export const marketingSectionY = "py-12 sm:py-16";

export const marketingShell = "mx-auto max-w-6xl";

export const marketingMeasure = "max-w-xl";

export const marketingMeasureWide = "max-w-3xl";
