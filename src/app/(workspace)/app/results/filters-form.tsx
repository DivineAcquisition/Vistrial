"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { STAGE_LABELS } from "@/lib/metrics/definitions";
import { RESULTS_RANGE_KEYS, RESULTS_RANGE_LABELS } from "@/lib/metrics/range";

type Option = { value: string; label: string };

export type FilterChoices = {
  sources: Option[];
  people: Option[] | null;
  fields: Array<{ key: string; label: string; values: string[] }>;
};

const ANY = "";

/** Range and filters. Applying keeps everything in the address, so a view can be shared or bookmarked. */
export function ResultsFiltersForm({
  current,
  choices,
  extra,
}: {
  current: Record<string, string>;
  choices: FilterChoices;
  /** Params to keep that the form does not edit, like the metric on a drill-through page. */
  extra?: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, string>>({
    range: current.range ?? "last_30_days",
    from: current.from ?? "",
    to: current.to ?? "",
    source: current.source ?? ANY,
    stage: current.stage ?? ANY,
    person: current.person ?? ANY,
    fieldValue: current.field && current.value ? `${current.field}\u0000${current.value}` : ANY,
  });
  const set = (key: string) => (event: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [key]: event.target.value }));

  const apply = (next: Record<string, string>) => {
    const search = new URLSearchParams(extra);
    search.set("range", next.range || "last_30_days");
    if (next.range === "custom") {
      if (next.from) search.set("from", next.from);
      if (next.to) search.set("to", next.to);
    }
    for (const key of ["source", "stage", "person"]) if (next[key]) search.set(key, next[key] as string);
    if (next.fieldValue) {
      const [field, value] = next.fieldValue.split("\u0000");
      if (field && value) {
        search.set("field", field);
        search.set("value", value);
      }
    }
    startTransition(() => router.push(`${pathname}?${search.toString()}`));
  };

  const fieldOptions: Option[] = choices.fields.flatMap((field) =>
    field.values.map((value) => ({ value: `${field.key}\u0000${value}`, label: `${field.label}: ${value}` }))
  );
  const filtered = ["source", "stage", "person", "fieldValue"].some((key) => values[key]);

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
      aria-label="Range and filters"
      aria-busy={pending || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        apply(values);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Range
          <Select
            name="range"
            density="compact"
            value={values.range}
            onChange={set("range")}
            options={RESULTS_RANGE_KEYS.map((key) => ({ value: key, label: RESULTS_RANGE_LABELS[key] }))}
          />
        </label>
        {values.range === "custom" ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              From
              <Input type="date" size="sm" value={values.from} onChange={set("from")} required />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              To
              <Input type="date" size="sm" value={values.to} onChange={set("to")} required />
            </label>
          </>
        ) : null}
        {choices.sources.length > 1 ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Source
            <Select
              density="compact"
              value={values.source}
              onChange={set("source")}
              options={[{ value: ANY, label: "Every source" }, ...choices.sources]}
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Stage now
          <Select
            density="compact"
            value={values.stage}
            onChange={set("stage")}
            options={[
              { value: ANY, label: "Every stage" },
              ...Object.entries(STAGE_LABELS)
                .filter(([key]) => key !== "none")
                .map(([value, label]) => ({ value, label })),
            ]}
          />
        </label>
        {choices.people && choices.people.length ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Person
            <Select
              density="compact"
              value={values.person}
              onChange={set("person")}
              options={[{ value: ANY, label: "Everyone" }, ...choices.people, { value: "unassigned", label: "Not assigned" }]}
            />
          </label>
        ) : null}
        {fieldOptions.length ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Case file detail
            <Select
              density="compact"
              value={values.fieldValue}
              onChange={set("fieldValue")}
              options={[{ value: ANY, label: "Any detail" }, ...fieldOptions]}
            />
          </label>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" size="sm" loading={pending}>
          Apply
        </Button>
        {filtered ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const cleared = { ...values, source: ANY, stage: ANY, person: ANY, fieldValue: ANY };
              setValues(cleared);
              apply(cleared);
            }}
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </form>
  );
}
