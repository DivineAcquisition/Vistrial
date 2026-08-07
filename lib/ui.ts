/**
 * Shared class recipes, taken from the DA hiring site. #9A88FC (brand-500) is
 * the prime action colour; it is light enough that near-black label text reads
 * far better on it than white, which is why primary buttons invert their type.
 * brand-300 carries eyebrows, section labels, and links.
 */

export const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50";

export const btnPrimary = `${btnBase} bg-brand-500 text-ink-950 shadow-[0_12px_34px_-14px_rgba(154,136,252,0.9)] hover:bg-brand-400 hover:shadow-[0_16px_40px_-14px_rgba(154,136,252,1)] active:bg-brand-600 active:text-white`;

export const btnSecondary = `${btnBase} border border-white/[0.12] bg-white/[0.03] text-white hover:border-white/25 hover:bg-white/[0.07]`;

export const btnGhost = `${btnBase} text-silver hover:text-white`;

export const btnSizeSm = "px-4 py-2 text-[13px]";
export const btnSizeMd = "px-5 py-2.5";
export const btnSizeLg = "px-7 py-3.5 text-[15px]";

export const eyebrow =
  "inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/[0.08] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-300";

export const sectionLabel =
  "text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-300";

/** Small uppercase caption above a filter or a stat, as on the hiring rail. */
export const filterLabel =
  "mb-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-dim";

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder-dim transition-colors hover:border-white/20 focus:border-brand-500/60 focus:bg-white/[0.05] focus:outline-none";

export const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-dim";

export const selectClass = `${inputClass} cursor-pointer appearance-none bg-ink-900 pr-9`;

export const helperClass = "mt-1.5 text-xs leading-relaxed text-dim";

export const errorClass = "mt-1.5 text-xs text-flag-critical";
