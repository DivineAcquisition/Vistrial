"use client";

import { useRouter } from "next/navigation";

import {
  QUEUE_STATUSES,
  type QueueAssignedFilter,
  type QueueFilters,
  type QueueTrackFilter,
} from "@/lib/queue/types";
import { queueFiltersHref } from "@/lib/queue/filters";
import { Select } from "@/components/ui/select";
import { ScoreRangeSlider } from "@/components/ui/slider-field";
import { filterLabel } from "@/lib/ui";

const ASSIGNED_OPTIONS: Array<{ value: QueueAssignedFilter; label: string }> = [
  { value: "all", label: "Everyone" },
  { value: "me", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
  { value: "me_or_unassigned", label: "Me or unassigned" },
];

const TRACK_OPTIONS: Array<{ value: "" | QueueTrackFilter; label: string }> = [
  { value: "", label: "Anyone" },
  { value: "ready", label: "Ready now" },
  { value: "nurture", label: "Nurture" },
];

const STATUS_LABELS: Record<(typeof QUEUE_STATUSES)[number], string> = {
  new: "New",
  working: "Working",
  call_booked: "Call booked",
  no_show: "No-show",
  follow_up: "Follow-up",
  objection_hold: "Objection hold",
  ghost: "Gone quiet",
  closed_won: "Closed won",
  closed_lost: "Closed lost",
};

export function QueueFilters({
  filters,
  sources,
}: {
  filters: QueueFilters;
  sources: string[];
}) {
  const router = useRouter();

  function apply(next: Partial<QueueFilters>) {
    router.replace(queueFiltersHref({ ...filters, ...next }));
  }

  return (
    <form
      className="app-enter mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="block">
        <span className={filterLabel}>Assigned</span>
        <Select
          density="compact"
          value={filters.assigned}
          onChange={(event) => apply({ assigned: event.target.value as QueueAssignedFilter })}
        >
          {ASSIGNED_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className={filterLabel}>How ready</span>
        <Select
          density="compact"
          value={filters.track ?? ""}
          onChange={(event) =>
            apply({ track: (event.target.value || null) as QueueTrackFilter | null })
          }
        >
          {TRACK_OPTIONS.map((option) => (
            <option key={option.value || "any"} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className={filterLabel}>Status</span>
        <Select
          density="compact"
          value={filters.status ?? ""}
          onChange={(event) =>
            apply({
              status: event.target.value
                ? (event.target.value as QueueFilters["status"])
                : null,
            })
          }
        >
          <option value="">Any status</option>
          {QUEUE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className={filterLabel}>Source</span>
        <Select
          density="compact"
          value={filters.source ?? ""}
          onChange={(event) => apply({ source: event.target.value || null })}
        >
          <option value="">Any source</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </Select>
      </label>
      <div className="lg:col-span-2">
        <span className={filterLabel}>How ready, out of 100</span>
        <ScoreRangeSlider
          min={filters.scoreMin}
          max={filters.scoreMax}
          onCommit={(next) => apply(next)}
        />
      </div>
    </form>
  );
}
