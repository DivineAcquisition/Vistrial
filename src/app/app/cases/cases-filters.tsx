"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { caseFiltersHref } from "@/lib/cases/filters";
import {
  CASE_SORTS,
  CASE_TRACKS,
  type CaseListFilters,
  type CaseSort,
  type CaseSortDir,
  type CaseTrackFilter,
} from "@/lib/cases/types";
import { LEAD_STATUS_LABELS, LEAD_STATUSES } from "@/lib/leads/labels";
import type { QueueMemberOption } from "@/lib/queue/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { filterLabel } from "@/lib/ui";

const SORT_LABELS: Record<CaseSort, string> = {
  last_touch: "Last touch",
  score: "Score",
  opted_in: "Opted in",
  status: "Status",
};

export function CasesFilters({
  filters,
  sources,
  members,
}: {
  filters: CaseListFilters;
  sources: string[];
  members: QueueMemberOption[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q ?? "");

  function apply(next: Partial<CaseListFilters>) {
    router.replace(caseFiltersHref({ ...filters, ...next }));
  }

  return (
    <form
      className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        apply({ q: q.trim() || null });
      }}
    >
      <label className="block sm:col-span-2">
        <span className={filterLabel}>Search</span>
        <Input
          type="search"
          density="compact"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Name, email, or phone"
        />
      </label>
      <div className="flex items-end">
        <Button type="submit" variant="secondary" size="sm">
          Search
        </Button>
      </div>
      <label className="block">
        <span className={filterLabel}>Status</span>
        <Select
          density="compact"
          value={filters.status ?? ""}
          onChange={(event) =>
            apply({ status: event.target.value ? (event.target.value as CaseListFilters["status"]) : null })
          }
        >
          <option value="">Any status</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {LEAD_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className={filterLabel}>Track</span>
        <Select
          density="compact"
          value={filters.track ?? ""}
          onChange={(event) =>
            apply({ track: (event.target.value || null) as CaseTrackFilter | null })
          }
        >
          <option value="">Any track</option>
          {CASE_TRACKS.map((track) => (
            <option key={track} value={track}>
              {track === "ready" ? "Ready" : "Nurture"}
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
      <label className="block">
        <span className={filterLabel}>Score min</span>
        <Input
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          placeholder="Any"
          density="compact"
          value={filters.scoreMin ?? ""}
          onChange={(event) => {
            const value = event.target.value.trim();
            apply({ scoreMin: value === "" ? null : Number(value) });
          }}
        />
      </label>
      <label className="block">
        <span className={filterLabel}>Score max</span>
        <Input
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          placeholder="Any"
          density="compact"
          value={filters.scoreMax ?? ""}
          onChange={(event) => {
            const value = event.target.value.trim();
            apply({ scoreMax: value === "" ? null : Number(value) });
          }}
        />
      </label>
      <label className="block">
        <span className={filterLabel}>Setter</span>
        <Select
          density="compact"
          value={filters.setterId ?? ""}
          onChange={(event) => apply({ setterId: event.target.value || null })}
        >
          <option value="">Any setter</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className={filterLabel}>Closer</span>
        <Select
          density="compact"
          value={filters.closerId ?? ""}
          onChange={(event) => apply({ closerId: event.target.value || null })}
        >
          <option value="">Any closer</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.displayName}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className={filterLabel}>Opted in from</span>
        <Input
          type="date"
          density="compact"
          value={filters.optedFrom ?? ""}
          onChange={(event) => apply({ optedFrom: event.target.value || null })}
          placeholder="YYYY-MM-DD"
        />
      </label>
      <label className="block">
        <span className={filterLabel}>Opted in to</span>
        <Input
          type="date"
          density="compact"
          value={filters.optedTo ?? ""}
          onChange={(event) => apply({ optedTo: event.target.value || null })}
          placeholder="YYYY-MM-DD"
        />
      </label>
      <label className="block">
        <span className={filterLabel}>Sort</span>
        <Select
          density="compact"
          value={filters.sort}
          onChange={(event) => apply({ sort: event.target.value as CaseSort, dir: "desc" })}
        >
          {CASE_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className={filterLabel}>Direction</span>
        <Select
          density="compact"
          value={filters.dir}
          onChange={(event) => apply({ dir: event.target.value as CaseSortDir })}
        >
          <option value="desc">Newest / highest first</option>
          <option value="asc">Oldest / lowest first</option>
        </Select>
      </label>
    </form>
  );
}
