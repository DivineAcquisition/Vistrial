import { cn } from "@/lib/utils";

/**
 * Headline and form recipes taken from the DA hiring / acq surfaces, mapped
 * onto Vistrial tokens. No new colours or faces — Inter, brand-500, ink-950.
 */

export const marketingHeroTitle =
  "text-[2.1rem] font-semibold leading-[1.08] text-white sm:text-5xl md:text-[3.25rem] md:leading-[1.05]";

export const marketingSectionTitle = "text-2xl font-semibold text-white sm:text-3xl";

export const marketingSubhead = "text-base leading-relaxed text-silver sm:text-lg";

/** DA QualifyGate labels: sentence case, white, tight tracking — not the app's uppercase dim labels. */
export const marketingFormLabel = "block text-[14px] font-semibold tracking-tight text-white";

/**
 * The acq field: a raised well the control sits inside, so focus lights the
 * whole row rather than a thin input border.
 */
export const marketingField = cn(
  "relative rounded-[0.9rem] border border-white/[0.09]",
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.02)_100%),#100f18]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors",
  "focus-within:border-brand-500/55 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_4px_rgba(154,136,252,0.14)]"
);

export const marketingFieldControl = cn(
  "block w-full min-h-[3.15rem] border-0 bg-transparent px-4 py-3",
  "text-[15px] font-medium tracking-tight text-white",
  "placeholder:font-medium placeholder:text-silver/70",
  "focus:outline-none"
);

export const marketingFieldSelect = `${marketingFieldControl} cursor-pointer appearance-none pr-10`;

export const marketingPageGutter = "px-5 sm:px-6";
