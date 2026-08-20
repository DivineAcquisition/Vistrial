/**
 * Queue durations are elapsed time an operator can scan: "19 min", "6 days".
 * Never a raw timestamp. Distinct from formatRelative, which is for other surfaces.
 */
export function formatQueueDuration(
  from: string | null | undefined,
  now: string | Date = new Date()
): string {
  if (!from) return "never";
  const start = Date.parse(from);
  const end = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "never";

  const diffMs = Math.max(0, end - start);
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;

  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

export function formatQueueUntil(target: string, now: string | Date = new Date()): string {
  const end = Date.parse(target);
  const start = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const minutes = Math.round((end - start) / 60000);
  if (minutes <= 0) return formatQueueDuration(target, now);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours === 1 ? "in 1 hour" : `in ${hours} hours`;
  const days = Math.round(hours / 24);
  return days === 1 ? "in 1 day" : `in ${days} days`;
}

export function formatBreachDuration(breachSeconds: number | null, now?: string | Date): string {
  if (breachSeconds === null || breachSeconds < 0) return "just now";
  const origin = typeof now === "string" ? Date.parse(now) : (now ?? new Date()).getTime();
  const from = new Date(origin - breachSeconds * 1000).toISOString();
  return formatQueueDuration(from, new Date(origin));
}
