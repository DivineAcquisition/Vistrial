/**
 * Shared class recipes, taken from the DA hiring site. #9A88FC (brand-500) is
 * the prime action colour; it is light enough that near-black label text reads
 * far better on it than white, which is why primary buttons invert their type.
 * brand-300 carries eyebrows, section labels, and links.
 *
 * These strings are the single source of truth for the look of a control. The
 * components in `components/ui` are built on top of them rather than beside
 * them, so a screen written against the raw recipe and a screen written against
 * the component cannot drift apart.
 *
 * Sizing rule: every interactive control is 32, 40 or 44px tall. A button, an
 * input and a select on the same row line up with nobody nudging padding.
 */

/* ---------------------------------------------------------------------------
 * Focus
 * ------------------------------------------------------------------------- */

/** Controls that draw their own ring rather than relying on the global outline. */
export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500/70";

/* ---------------------------------------------------------------------------
 * Buttons
 * ------------------------------------------------------------------------- */

export const btnBase =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0";

/** The filled action. One per screen, give or take. */
export const btnPrimary = `${btnBase} bg-brand-500 text-ink-950 hover:bg-brand-400 active:bg-brand-600 active:text-white`;

/**
 * Reserved for the action a screen exists for: connecting the CRM, going live,
 * generating the report. Nothing routine gets this, or it stops meaning
 * anything. The gradient runs brand-400 to brand-600 and adds no new colour.
 */
export const btnGradient = `${btnBase} action-gradient text-ink-950 shadow-[0_1px_0_rgba(255,255,255,0.18)_inset] active:brightness-95`;

export const btnSecondary = `${btnBase} border border-white/[0.12] bg-white/[0.03] text-white hover:border-white/25 hover:bg-white/[0.07] active:bg-white/[0.04]`;

/** Quieter than secondary: an outline with no fill until you touch it. */
export const btnOutline = `${btnBase} border border-white/[0.14] text-silver hover:border-white/30 hover:text-white active:bg-white/[0.04]`;

export const btnGhost = `${btnBase} text-silver hover:bg-white/[0.05] hover:text-white active:bg-white/[0.03]`;

/** Consequential and irreversible. Never the default on a form. */
export const btnDestructive = `${btnBase} border border-flag-critical/35 bg-flag-critical/[0.12] text-flag-critical hover:border-flag-critical/55 hover:bg-flag-critical/[0.18]`;

/** Reads as text, behaves as a button. */
export const btnLink =
  "inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-brand-300 underline-offset-4 transition-colors hover:text-white hover:underline disabled:pointer-events-none disabled:opacity-45";

export const btnSizeSm = "h-8 px-3.5 text-[13px]";
export const btnSizeMd = "h-10 px-5";
export const btnSizeLg = "h-11 px-6 text-[15px]";

/** Square, for a control whose whole label is its icon. */
export const btnIconSm = "size-8 p-0";
export const btnIconMd = "size-10 p-0";
export const btnIconLg = "size-11 p-0";

/* ---------------------------------------------------------------------------
 * Type scale
 * ------------------------------------------------------------------------- */

export const eyebrow =
  "inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/[0.08] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300";

export const sectionLabel =
  "text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300";

/** Small uppercase caption above a filter or a stat, as on the hiring rail. */
export const filterLabel =
  "mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-dim";

export const pageTitle = "text-2xl font-semibold text-white sm:text-[28px]";
/** A heading that owns a band of the page, above several cards. */
export const sectionTitle = "text-base font-semibold text-white";
/** The title of one card. The most common heading in the app. */
export const cardTitle = "text-sm font-semibold text-white";
export const bodyText = "text-sm leading-relaxed text-silver";
export const captionText = "text-xs text-dim";
export const metricValue = "text-2xl font-semibold tabular-nums";

/* ---------------------------------------------------------------------------
 * Form controls
 * ------------------------------------------------------------------------- */

const controlSurface =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white placeholder-dim transition-colors";
const controlFocus =
  "hover:border-white/20 focus:border-brand-500/60 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-brand-500/20";
const controlInvalid =
  "aria-[invalid=true]:border-flag-critical/60 aria-[invalid=true]:focus:ring-flag-critical/20";
const controlDisabled =
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-white/10";

export const inputClass = `${controlSurface} ${controlFocus} ${controlInvalid} ${controlDisabled} min-h-10 px-3.5 py-2`;

export const textareaClass = `${controlSurface} ${controlFocus} ${controlInvalid} ${controlDisabled} min-h-24 resize-y px-3.5 py-2.5 leading-relaxed`;

export const selectClass = `${inputClass} cursor-pointer appearance-none bg-ink-900 pr-9 disabled:cursor-not-allowed`;

/** A read-only value styled as a field, so a locked row still lines up. */
export const readonlyFieldClass =
  "min-h-10 w-full rounded-xl border border-white/[0.07] bg-white/[0.015] px-3.5 py-2 text-sm text-silver";

export const checkboxClass =
  "size-4 shrink-0 cursor-pointer appearance-none rounded-[5px] border border-white/25 bg-white/[0.04] transition-colors checked:border-brand-500 checked:bg-brand-500 checked:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 16 16%22 fill=%22none%22 stroke=%22%2307070b%22 stroke-width=%222.4%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22M3.5 8.5l3 3 6-6%22/></svg>')] bg-center bg-no-repeat hover:border-white/40 checked:hover:border-brand-400 disabled:cursor-not-allowed disabled:opacity-50";

export const radioClass =
  "size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-white/25 bg-white/[0.04] transition-colors checked:border-[5px] checked:border-brand-500 hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-50";

export const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-dim";

export const helperClass = "mt-1.5 text-xs leading-relaxed text-dim";

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
export const pageStack = "space-y-6";
/** Vertical rhythm between rows inside one card. */
export const cardStack = "space-y-4";
