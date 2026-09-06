"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import {
  activeQueueFilterCount,
  defaultAssignedFilter,
  queueFiltersHref,
} from "@/lib/queue/filters";
import {
  QUEUE_STATUSES,
  type QueueAssignedFilter,
  type QueueFilters,
  type QueueTrackFilter,
} from "@/lib/queue/types";
import { filterLabel } from "@/lib/ui";
import type { OrgRole } from "@/types/database";

const ASSIGNED_OPTIONS: Array<{ value: QueueAssignedFilter; label: string }> = [
  { value: "me_or_unassigned", label: "Mine and unassigned" },
  { value: "me", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
  { value: "all", label: "Everyone" },
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

/**
 * One control, not a row of them (Prompt 7, Part 5). Everything but the
 * default assignment split lives behind this single trigger for the rare
 * person who wants it. The score range that used to sit here is gone: a
 * number-out-of-100 filter is exactly the scoring machinery this screen was
 * rebuilt to stop showing.
 */
export function QueueFiltersControl({
  filters,
  sources,
  role,
  isPlatformAdmin,
  onNavigate,
}: {
  filters: QueueFilters;
  sources: string[];
  role: OrgRole;
  isPlatformAdmin: boolean;
  onNavigate: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(filters);

  function openWithCurrent() {
    setPending(filters);
    setOpen(true);
  }

  function apply(next: Partial<QueueFilters>) {
    const merged = { ...pending, ...next };
    setPending(merged);
    onNavigate(queueFiltersHref(merged));
  }

  function reset() {
    const cleared: QueueFilters = {
      assigned: defaultAssignedFilter(role, isPlatformAdmin),
      track: null,
      status: null,
      source: null,
      breached: false,
    };
    setPending(cleared);
    onNavigate(queueFiltersHref(cleared));
  }

  const count = activeQueueFilterCount(filters, { role, isPlatformAdmin });

  return (
    <Popover
      open={open}
      onOpenChange={(next) => (next ? openWithCurrent() : setOpen(next))}
    >
      <PopoverTrigger
        render={
          <Button type="button" variant="secondary" size="sm">
            Filters
            {count > 0 ? (
              <Badge variant="default" size="sm" className="ml-1.5">
                {count}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverPopup align="end" className="w-72">
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className={filterLabel}>Assigned</span>
            <Select
              density="compact"
              value={pending.assigned}
              onChange={(event) =>
                apply({ assigned: event.target.value as QueueAssignedFilter })
              }
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
              value={pending.track ?? ""}
              onChange={(event) =>
                apply({
                  track: (event.target.value ||
                    null) as QueueTrackFilter | null,
                })
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
              value={pending.status ?? ""}
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
          {sources.length > 0 ? (
            <label className="block">
              <span className={filterLabel}>Source</span>
              <Select
                density="compact"
                value={pending.source ?? ""}
                onChange={(event) =>
                  apply({ source: event.target.value || null })
                }
              >
                <option value="">Any source</option>
                {sources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Reset filters
          </Button>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
