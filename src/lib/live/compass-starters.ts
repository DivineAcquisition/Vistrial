/**
 * Starter questions for Compass, built from the workspace's own industry
 * setup so a med spa and a roofer see questions in their own terms.
 */

type Suggestion = { prompt: string; label: string };

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object") : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function compassStarters(values: Record<string, unknown>, limit = 3): Suggestion[] {
  const out: Suggestion[] = [];
  const offer = list(values["industry.offers"]).map((item) => text(item.name)).find(Boolean);
  const objection = list(values["industry.objections"]).map((item) => text(item.label)).find(Boolean);
  const urgency = (Array.isArray(values["industry.urgency_signals"]) ? values["industry.urgency_signals"] : [])
    .map(text)
    .find(Boolean);

  if (offer) out.push({ prompt: `Which recent leads are most likely to book ${offer}, and why?`, label: `Likely ${offer} bookings` });
  if (objection) out.push({ prompt: `How are we handling "${objection}" on calls, and what works best?`, label: `Handling "${objection}"` });
  if (urgency) out.push({ prompt: `Which leads showed "${urgency}" this week and still need a reply?`, label: "Leads that need attention now" });
  if (out.length < limit) out.push({ prompt: "Which leads went quiet after a good first call?", label: "Leads that went quiet" });
  return out.slice(0, limit);
}
