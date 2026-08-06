/**
 * Shared class recipes. DA Purple (brand-700 #6A00FF) is confined to filled
 * primary buttons — it is saturated enough to vibrate against a dark background
 * when used at scale. DA Light Purple (brand-500 #937DFF) carries every other
 * accent.
 */

export const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50";

export const btnPrimary = `${btnBase} bg-brand-700 text-white shadow-[0_12px_34px_-14px_rgba(106,0,255,0.9)] hover:bg-brand-600 hover:shadow-[0_16px_40px_-14px_rgba(106,0,255,1)] active:bg-brand-800`;

export const btnSecondary = `${btnBase} border border-border bg-white/[0.03] text-white hover:border-brand-500/40 hover:bg-white/[0.06]`;

export const btnGhost = `${btnBase} text-dim hover:text-silver`;

export const btnSizeSm = "px-4 py-2 text-[13px]";
export const btnSizeMd = "px-5 py-2.5";
export const btnSizeLg = "px-7 py-3.5 text-[15px]";

export const eyebrow =
  "inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/[0.08] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-500";

export const sectionLabel =
  "text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-500";

export const inputClass =
  "w-full rounded-xl border border-input bg-white/[0.03] px-3.5 py-2.5 text-sm text-white placeholder-dim transition-colors focus:border-brand-500/60 focus:bg-white/[0.05] focus:outline-none";

export const labelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-dim";

export const selectClass = `${inputClass} cursor-pointer appearance-none bg-popover pr-9`;

export const helperClass = "mt-1.5 text-xs leading-relaxed text-dim";

export const errorClass = "mt-1.5 text-xs text-flag-critical";
