"use client";

import { useRouter } from "next/navigation";

import { activityFiltersHref } from "@/lib/activity/filters";
import {
  ACTIVITY_CATEGORIES,
  type ActivityActorOption,
  type ActivityCategory,
  type ActivityFilters,
  type ActivityIntegration,
} from "@/lib/activity/types";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { filterLabel } from "@/lib/ui";

const CATEGORY_LABELS: Record<ActivityCategory | "", string> = {
  "": "All categories",
  inbound: "Inbound",
  system: "System",
  user: "People",
  agent: "Agent",
  operator: "DA operator",
};

export function ActivityFiltersForm({
  filters,
  actors,
  basePath = "/app/activity",
  clients,
}: {
  filters: ActivityFilters;
  actors: ActivityActorOption[];
  basePath?: string;
  clients?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();

  function apply(next: Partial<ActivityFilters>) {
    router.replace(activityFiltersHref({ ...filters, ...next }, basePath));
  }

  return (
    <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => event.preventDefault()}>
      <label className="block">
        <span className={filterLabel}>Search lead</span>
        <Input
          density="compact"
          defaultValue={filters.q ?? ""}
          placeholder="Lead name"
          onBlur={(event) => apply({ q: event.target.value.trim() || null })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply({ q: (event.target as HTMLInputElement).value.trim() || null });
            }
          }}
        />
      </label>
      <label className="block">
        <span className={filterLabel}>Category</span>
        <Select
          density="compact"
          value={filters.category ?? ""}
          onChange={(event) =>
            apply({ category: (event.target.value || null) as ActivityCategory | null })
          }
        >
          {(["", ...ACTIVITY_CATEGORIES] as const).map((value) => (
            <option key={value || "all"} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </Select>
      </label>
      {actors.length > 0 ? (
      <label className="block">
        <span className={filterLabel}>Who</span>
        <Select
          density="compact"
          value={filters.actorUserId ?? ""}
          onChange={(event) => apply({ actorUserId: event.target.value || null })}
        >
          <option value="">Anyone</option>
          {actors.map((actor) => (
            <option key={actor.userId} value={actor.userId}>
              {actor.displayName}
            </option>
          ))}
        </Select>
      </label>
      ) : null}
      <label className="block">
        <span className={filterLabel}>Integration</span>
        <Select
          density="compact"
          value={filters.integration ?? ""}
          onChange={(event) =>
            apply({
              integration: (event.target.value || null) as ActivityIntegration | null,
            })
          }
        >
          <option value="">Any</option>
          <option value="gohighlevel">GoHighLevel</option>
        </Select>
      </label>
      {clients ? (
        <label className="block">
          <span className={filterLabel}>Client</span>
          <Select
            density="compact"
            value={filters.orgId ?? ""}
            onChange={(event) => apply({ orgId: event.target.value || null })}
          >
            <option value="">All clients</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <label className="block">
        <span className={filterLabel}>From</span>
        <Input
          density="compact"
          type="date"
          value={filters.from?.slice(0, 10) ?? ""}
          onChange={(event) => apply({ from: event.target.value || null })}
          placeholder="YYYY-MM-DD"
        />
      </label>
      <label className="block">
        <span className={filterLabel}>To</span>
        <Input
          density="compact"
          type="date"
          value={filters.to?.slice(0, 10) ?? ""}
          onChange={(event) => apply({ to: event.target.value || null })}
          placeholder="YYYY-MM-DD"
        />
      </label>
      <div className="flex flex-col justify-end gap-3 sm:col-span-2 lg:col-span-4">
        <Switch
          checked={filters.failuresOnly}
          onChange={(event) => apply({ failuresOnly: event.target.checked })}
          label="Failures only"
        />
        <Switch
          checked={filters.includeSync}
          onChange={(event) => apply({ includeSync: event.target.checked })}
          label="Show CRM sync"
          description="Contact and opportunity updates. Off by default so the feed stays readable."
        />
        <Switch
          checked={filters.includeRoutine}
          onChange={(event) => apply({ includeRoutine: event.target.checked })}
          label="Show routine system work"
          description="Scoring, extraction, jobs, and transcripts. The default view keeps these off."
        />
      </div>
    </form>
  );
}
