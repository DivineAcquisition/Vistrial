import type { FilterChoices } from "@/app/(workspace)/app/results/filters-form";
import type { WorkspaceFacts } from "@/lib/metrics/load";
import { filtersToParams, type ResultsFilters, type ResultsRange } from "@/lib/metrics/range";

/** The drill-through list for a number, carrying the same range and filters the number used. */
export function buildDrillHref(
  metric: string,
  range: Pick<ResultsRange, "params">,
  filters: ResultsFilters,
  extra: Record<string, string> = {}
): string {
  const search = new URLSearchParams({ metric, ...range.params, ...filtersToParams(filters), ...extra });
  if (extra.range && extra.range !== "custom") {
    search.delete("from");
    search.delete("to");
  }
  return `/app/results/leads?${search.toString()}`;
}

export function filterChoices(facts: WorkspaceFacts): FilterChoices {
  return {
    sources: facts.sources.map((source) => ({ value: source.key, label: source.label })),
    people: facts.people
      ? facts.people.map((person) => ({
          value: person.id,
          label: person.active ? person.name : `${person.name} (no longer on the team)`,
        }))
      : null,
    fields: facts.fields,
  };
}
