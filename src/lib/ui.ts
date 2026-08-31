/**
 * Shared class recipes, mapped onto coss primitives so a screen written against
 * these strings and a screen written against `<Button>` / `<Input>` look the same.
 *
 * In-app screens should use the primitives. These strings remain for recipes
 * such as readonly field chrome and any last native leftovers.
 *
 * #9A88FC (brand-500) is the prime action colour. It is light enough that
 * near-black label text reads far better on it than white, which is why primary
 * buttons invert their type. brand-300 carries eyebrows, section labels, and links.
 */

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
 * Focus
 * ------------------------------------------------------------------------- */

/** Controls that draw their own ring rather than relying on the global outline. */
export const focusRing =
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

/* ---------------------------------------------------------------------------
 * Buttons — coss `buttonVariants`, so leftover class-string call sites match
 * `<Button>`. Size recipes use important utilities so they win over the default
 * size baked into the variant string when concatenated.
 * ------------------------------------------------------------------------- */

export const btnBase = buttonVariants({ variant: "secondary" });

/** The filled action. One per screen, give or take. */
export const btnPrimary = buttonVariants({ variant: "primary" });

/**
 * Reserved for the action a screen exists for: connecting the CRM, going live,
 * generating the report. Nothing routine gets this, or it stops meaning
 * anything.
 */
export const btnGradient = buttonVariants({ variant: "gradient" });

export const btnSecondary = buttonVariants({ variant: "secondary" });

/** Quieter than secondary: an outline with no fill until you touch it. */
export const btnOutline = buttonVariants({ variant: "outline" });

export const btnGhost = buttonVariants({ variant: "ghost" });

/** Consequential and irreversible. Never the default on a form. */
export const btnDestructive = buttonVariants({ variant: "destructive" });

/** Reads as text, behaves as a button. */
export const btnLink = buttonVariants({ variant: "link" });

export const btnSizeSm =
  "h-8! gap-1.5 px-[calc(--spacing(2.5)-1px)]! sm:h-7!";
export const btnSizeMd =
  "h-10! px-[calc(--spacing(3.5)-1px)]! sm:h-9!";
export const btnSizeLg =
  "h-11! px-[calc(--spacing(4)-1px)]! text-lg! sm:h-10! sm:text-base!";

/** Square, for a control whose whole label is its icon. */
export const btnIconSm = "size-8! p-0! sm:size-7!";
export const btnIconMd = "size-9! p-0! sm:size-8!";
export const btnIconLg = "size-10! p-0! sm:size-9!";

/* ---------------------------------------------------------------------------
 * Type scale
 * ------------------------------------------------------------------------- */

export const eyebrow =
  "inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/[0.08] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-300";

export const sectionLabel =
  "text-xs font-semibold uppercase tracking-[0.2em] text-brand-300";

/** Small uppercase caption above a filter or a stat, as on the hiring rail. */
export const filterLabel =
  "mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";

export const pageTitle =
  "font-heading text-[1.85rem] leading-[1.15] text-card-foreground sm:text-[2.15rem]";
/** A heading that owns a band of the page, above several cards. */
export const sectionTitle = "font-heading text-lg text-card-foreground";
/** The title of one card. The most common heading in the app. */
export const cardTitle = "font-heading text-base text-card-foreground";
export const bodyText = "text-[15px] leading-relaxed text-muted-foreground";
export const captionText = "text-xs text-muted-foreground";
export const metricValue = "text-2xl font-semibold tabular-nums";

/* ---------------------------------------------------------------------------
 * Form controls
 *
 * Native field chrome for readonly displays and rare single-element leftovers.
 * Live forms should use `<Input>` / `<Textarea>` / `<Select>`.
 * ------------------------------------------------------------------------- */

/** Form fields and labelled settings. Sentence case, not a caption. */
export const labelClass =
  "mb-2 inline-flex items-center gap-2 font-medium text-base/4.5 text-card-foreground sm:text-sm/4";

const nativeFieldChrome =
  "relative w-full min-w-0 rounded-xl border border-white/[0.09] bg-ink-850 text-base text-card-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] outline-none ring-brand-500/20 transition-shadow scheme-dark not-dark:bg-clip-padding placeholder:text-muted-foreground/72 hover:not-disabled:border-white/[0.16] focus-visible:border-brand-500/55 focus-visible:ring-[3px] aria-invalid:border-destructive/36 focus-visible:aria-invalid:border-destructive/64 focus-visible:aria-invalid:ring-destructive/16 disabled:pointer-events-none disabled:opacity-64 dark:bg-ink-850 dark:aria-invalid:ring-destructive/24 sm:text-sm [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70 [&::-webkit-calendar-picker-indicator]:invert";

export const inputClass = cn(
  nativeFieldChrome,
  "h-10 px-[calc(--spacing(4)-1px)] leading-10 sm:h-9 sm:leading-9",
);

/** Same chrome at the compact coss size, for filter bars and table toolbars. */
export const inputCompactClass = cn(
  nativeFieldChrome,
  "h-8.5 rounded-lg px-[calc(--spacing(2.5)-1px)] leading-8.5 sm:h-7.5 sm:leading-7.5",
);

export const textareaClass = cn(
  nativeFieldChrome,
  "field-sizing-content min-h-17.5 px-[calc(--spacing(4)-1px)] py-[calc(--spacing(2)-1px)] max-sm:min-h-20.5",
);

export const selectClass = inputClass;

export const selectCompactClass = inputCompactClass;

/** A read-only value styled as a field, so a locked row still lines up. */
export const readonlyFieldClass = cn(inputClass, "pointer-events-none opacity-80");

export const checkboxClass =
  "relative inline-flex size-4.5 shrink-0 cursor-pointer appearance-none items-center justify-center rounded-[.25rem] border border-white/[0.14] bg-ink-850 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] checked:border-primary checked:bg-primary sm:size-4 dark:not-checked:bg-ink-850";

export const radioClass =
  "relative inline-flex size-4.5 shrink-0 cursor-pointer appearance-none rounded-full border border-white/[0.14] bg-ink-850 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] checked:border-[5px] checked:border-primary sm:size-4 dark:not-checked:bg-ink-850";

export const helperClass = "mt-1.5 text-xs leading-relaxed text-muted-foreground";

export const errorClass = "mt-1.5 text-xs text-flag-critical";

/* ---------------------------------------------------------------------------
 * Surfaces
 * ------------------------------------------------------------------------- */

/**
 * Card padding. Three steps, not the six that grew by hand. `default` matches
 * what most panels already use, so adopting the scale moves almost nothing.
 */
export const surfacePad = {
  none: "",
  compact: "p-4",
  default: "p-6",
  roomy: "p-8",
} as const;

export type SurfacePad = keyof typeof surfacePad;

/** Vertical rhythm between the major bands of a page. */
export const pageStack = "flex flex-col gap-6";
/** Vertical rhythm between rows inside one card. */
export const cardStack = "flex flex-col gap-4";

/** Settings and marketing forms. Wide enough for longer placeholders. */
export const formMeasure = "w-full max-w-2xl";

/** A confirmation that something saved. Reads as success, not as a footnote. */
export const successClass = "mt-1.5 text-xs font-medium text-flag-good";
