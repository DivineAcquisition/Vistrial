/** Formatters ported from the Divine Acquisition repo (lib/vistrial/format.ts). */

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const DAY_WITH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const toDay = (value: string) => value.slice(0, 10);

export const formatDay = (value: string) =>
  DAY_FORMAT.format(new Date(`${toDay(value)}T00:00:00Z`));

export const formatDayLong = (value: string) =>
  DAY_WITH_YEAR.format(new Date(`${toDay(value)}T00:00:00Z`));

export const formatTime = (value: string) => TIME_FORMAT.format(new Date(value));

export const formatDateTime = (value: string) =>
  `${DAY_FORMAT.format(new Date(value))} · ${TIME_FORMAT.format(new Date(value))}`;

export const formatMonth = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${toDay(value)}T00:00:00Z`));

export function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const absolute = Math.abs(amount);
  const hasCents = Math.round(absolute * 100) % 100 !== 0;
  return `${sign}$${absolute.toLocaleString("en-US", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export const formatPercent = (rate: number, decimals = 0) =>
  `${(rate * 100).toFixed(decimals)}%`;

export function formatRelative(value: string, now: string): string {
  const diffMs = Date.parse(now) - Date.parse(value);
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 1) return "just now";
  if (Math.abs(minutes) < 60)
    return minutes > 0 ? `${minutes}m ago` : `in ${-minutes}m`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return hours > 0 ? `${hours}h ago` : `in ${-hours}h`;
  const days = Math.round(hours / 24);
  return days > 0 ? `${days}d ago` : `in ${-days}d`;
}

/**
 * A figure that was never measured, or configuration a client does not have, is
 * an em dash rather than a zero. The two say different things and only one of
 * them is safe to read as a number.
 */
export const orGap = <T,>(
  value: T | null | undefined,
  render: (value: T) => string
) => (value === null || value === undefined ? "\u2014" : render(value));

export const titleCase = (value: string) =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
