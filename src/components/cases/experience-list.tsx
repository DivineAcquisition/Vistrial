"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  deleteLeadViewAction,
  exportCasesAction,
  fetchExperiencePage,
  meaningSearchAction,
  saveLeadViewAction,
  setListDensityAction,
} from "@/app/(workspace)/app/cases/experience-actions";
import { assignQueueLead } from "@/app/(workspace)/app/queue/actions";
import { LeadLiveIndicator } from "@/components/live/handoff-pipeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  BUILT_IN_VIEWS,
  RESPONSE_LABEL,
  activeChips,
  clearChip,
  experienceSearchParams,
  type ExperienceFilter,
  type ExperienceRow,
  type ListSettings,
} from "@/lib/cases/experience";
import { LEAD_STATUS_LABELS, leadStatusTone } from "@/lib/leads/labels";
import { formatQueueDuration } from "@/lib/queue/duration";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/status-badge";

const RESPONSE_TONE = { on_time: "good", at_risk: "warning", missed: "critical", not_applicable: "neutral" } as const;

export function ExperienceList({
  filter,
  rows: initialRows,
  hasMore: initialMore,
  settings,
  counts,
  sources,
  savedViews,
  density: initialDensity,
  canExport,
  canBulk,
  memberId,
  orgId,
}: {
  filter: ExperienceFilter;
  rows: ExperienceRow[];
  hasMore: boolean;
  settings: ListSettings;
  counts: Record<string, number>;
  sources: string[];
  savedViews: Array<{ id: string; name: string; shared: boolean }>;
  density: "comfortable" | "dense";
  canExport: boolean;
  canBulk: boolean;
  memberId: string;
  orgId: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialMore);
  const [offset, setOffset] = useState(initialRows.length);
  const [density, setDensity] = useState(initialDensity);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [arrived, setArrived] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [meaningHits, setMeaningHits] = useState<Array<{ leadId: string; excerpt: string | null }> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const now = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`cases:${orgId}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "case_files", filter: `org_id=eq.${orgId}` }, (payload: { eventType: string; new: Record<string, unknown> }) => {
        const id = String(payload.new.lead_id ?? "");
        if (!id) return;
        setRows((current) => {
          if (!current.some((row) => row.id === id)) {
            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") setArrived((count) => count + 1);
            return current;
          }
          setFresh((ids) => new Set(ids).add(id));
          return current.map((row) =>
            row.id === id
              ? {
                  ...row,
                  headline: typeof payload.new.summary === "string" ? payload.new.summary.split(/(?<=[.!?])\s/)[0]?.slice(0, 110) ?? row.headline : row.headline,
                  band: (payload.new.band as string | null) ?? row.band,
                  fileStatus: (payload.new.status as string | null) ?? row.fileStatus,
                  nextStep: row.personAction ?? (payload.new.next_step as string | null) ?? row.nextStep,
                }
              : row
          );
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orgId]);

  useEffect(() => {
    if (fresh.size === 0) return;
    const timer = setTimeout(() => setFresh(new Set()), 2500);
    return () => clearTimeout(timer);
  }, [fresh]);

  const href = (next: ExperienceFilter) => `/app/cases?${experienceSearchParams(next).toString()}`;
  const chips = activeChips(filter, settings.facts);

  function go(next: ExperienceFilter) {
    router.push(href(next));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Saved views">
        {BUILT_IN_VIEWS.map((view) => (
          <Button key={view.id} size="sm" variant={filter.view === view.id ? "default" : "outline"} render={<Link href={href({ ...filter, view: view.id })} />}>
            {view.name}
            {counts[view.id] != null ? <span className="ml-1 text-xs opacity-70">{counts[view.id]}</span> : null}
          </Button>
        ))}
        {savedViews.map((view) => (
          <span key={view.id} className="inline-flex items-center gap-1">
            <Button size="sm" variant="outline" render={<Link href={`/app/cases?saved=${view.id}`} />}>
              {view.name}
              {view.shared ? " · shared" : ""}
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Delete ${view.name}`} onClick={() => start(() => void deleteLeadViewAction(view.id).then(() => router.refresh()))}>
              ×
            </Button>
          </span>
        ))}
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const meaning = data.get("meaning") === "on";
          const q = String(data.get("q") ?? "");
          if (meaning && q.trim()) {
            start(async () => {
              const result = await meaningSearchAction(q);
              if (!result.ok) setMessage(result.error);
              else {
                setMessage(null);
                setMeaningHits(result.data);
              }
            });
            go({ ...filter, q, meaning: true });
            return;
          }
          setMeaningHits(null);
          go({
            ...filter,
            q: q || null,
            meaning: false,
            status: String(data.get("status") || "") || null,
            source: String(data.get("source") || "") || null,
            assignee: String(data.get("assignee") || "") || null,
            response: (String(data.get("response") || "") || null) as ExperienceFilter["response"],
            band: String(data.get("band") || "") || null,
            factKey: String(data.get("fact") || "") || null,
            factValue: String(data.get("factValue") || "") || null,
            flagged: data.get("flagged") === "on",
            needsReview: data.get("review") === "on",
            unresolvedObjection: data.get("objection") === "on",
            optOut: data.get("optout") === "on",
          });
        }}
      >
        <Input name="q" defaultValue={filter.q ?? ""} placeholder="Name, phone, email, or words from the summary" aria-label="Search leads" className="min-w-56 flex-1" />
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" name="meaning" defaultChecked={filter.meaning} /> Search by meaning
        </label>
        <Select name="status" label="Stage" value={filter.status} options={["new", "working", "call_booked", "follow_up", "objection_hold", "no_show", "ghost", "closed_won", "closed_lost"]} />
        <Select name="response" label="Response" value={filter.response} options={["on_time", "at_risk", "missed", "not_applicable"]} />
        <Select name="band" label="Readiness" value={filter.band} options={["unscored", ...settings.bands.map((band) => band.name)]} />
        <Select name="source" label="Source" value={filter.source} options={sources} />
        <Select name="assignee" label="Assigned" value={filter.assignee} options={["unassigned", "me"]} />
        {settings.facts.length ? (
          <>
            <Select name="fact" label="Field" value={filter.factKey} options={settings.facts.map((fact) => fact.key)} labels={Object.fromEntries(settings.facts.map((fact) => [fact.key, fact.label]))} />
            <Input name="factValue" defaultValue={filter.factValue ?? ""} placeholder="Field contains" aria-label="Field value" className="w-36" />
          </>
        ) : null}
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="flagged" defaultChecked={filter.flagged} /> Agent flagged</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="review" defaultChecked={filter.needsReview} /> Needs review</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="objection" defaultChecked={filter.unresolvedObjection} /> Unresolved objection</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="optout" defaultChecked={filter.optOut} /> Opt-out</label>
        <Button type="submit" size="sm">Apply</Button>
      </form>

      {chips.length ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {chips.map((chip) => (
            <Button key={chip.key} size="sm" variant="outline" onClick={() => go(clearChip(filter, chip.key))}>
              {chip.label} ×
            </Button>
          ))}
          <Button size="sm" variant="ghost" render={<Link href="/app/cases" />}>Clear all</Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">
          Sort
          <select
            className="ml-2 rounded-md border border-border bg-background px-2 py-1"
            value={`${filter.sort}:${filter.dir}`}
            onChange={(event) => {
              const [sort, dir] = event.target.value.split(":");
              go({ ...filter, sort: sort as ExperienceFilter["sort"], dir: dir as ExperienceFilter["dir"] });
            }}
          >
            <option value="urgency:desc">Most urgent</option>
            <option value="last_touch:desc">Last touch, newest</option>
            <option value="readiness:desc">Readiness, highest</option>
            <option value="created:desc">Newest</option>
            <option value="name:asc">Name</option>
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const next = density === "dense" ? "comfortable" : "dense";
            setDensity(next);
            void setListDensityAction(next);
          }}
        >
          {density === "dense" ? "Comfortable list" : "Dense table"}
        </Button>
        <SaveView filter={filter} canShare={canExport} />
        {canExport ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              start(async () => {
                const result = await exportCasesAction(filter);
                if (!result.ok) {
                  setMessage(result.error);
                  return;
                }
                const blob = new Blob([result.data.csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "leads.csv";
                link.click();
                URL.revokeObjectURL(url);
              })
            }
          >
            Export this view
          </Button>
        ) : null}
      </div>

      {arrived > 0 ? (
        <Button size="sm" variant="outline" onClick={() => router.refresh()}>
          {arrived} new {arrived === 1 ? "update" : "updates"} available
        </Button>
      ) : null}
      {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
      {meaningHits ? (
        <Card className="space-y-2 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Search by meaning, this workspace only</p>
          {meaningHits.length === 0 ? <p className="text-sm text-muted-foreground">Nothing matched.</p> : null}
          <ul className="space-y-1">
            {meaningHits.map((hit) => (
              <li key={hit.leadId}>
                <Link className="text-sm underline underline-offset-2" href={`/app/cases/${hit.leadId}`}>{rows.find((row) => row.id === hit.leadId)?.name ?? "Open lead"}</Link>
                {hit.excerpt ? <p className="text-xs text-muted-foreground">{hit.excerpt}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {canBulk && selected.size > 0 ? (
        <ConfirmDialog
          trigger={<Button size="sm">Assign {selected.size} to me</Button>}
          title={`Assign ${selected.size} leads to you?`}
          description={`${selected.size} leads will be assigned to you inside Vistrial. Nothing is written to the CRM.`}
          confirmLabel={`Assign ${selected.size}`}
          confirmVariant="default"
          onConfirm={async () => {
            for (const leadId of selected) {
              await assignQueueLead({ leadId, setterId: memberId, closerId: null });
            }
            setSelected(new Set());
            router.refresh();
          }}
        />
      ) : null}

      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No leads match. Clear a filter or add a person.</Card>
      ) : density === "dense" ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                {canBulk ? <th className="p-2" /> : null}
                <th className="p-2">Lead</th>
                <th className="p-2">Readiness</th>
                <th className="p-2">Stage</th>
                <th className="hidden p-2 md:table-cell">Response</th>
                <th className="hidden p-2 lg:table-cell">Next</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={cn("border-t border-border", fresh.has(row.id) && "bg-accent")}>
                  {canBulk ? (
                    <td className="p-2">
                      <input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(row.id)} onChange={() => setSelected((current) => toggle(current, row.id))} />
                    </td>
                  ) : null}
                  <td className="p-2"><RowBody row={row} /></td>
                  <td className="p-2">{row.band ?? "Not yet scored"}</td>
                  <td className="p-2">{LEAD_STATUS_LABELS[row.status as keyof typeof LEAD_STATUS_LABELS] ?? row.status}</td>
                  <td className="hidden p-2 md:table-cell">{row.clockLabel ?? RESPONSE_LABEL[row.responseState]}</td>
                  <td className="hidden p-2 lg:table-cell">{row.nextStep ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className={cn("rounded-lg border border-border p-3", fresh.has(row.id) && "bg-accent")}>
              <div className="flex items-start gap-2">
                {canBulk ? <input type="checkbox" className="mt-1" aria-label={`Select ${row.name}`} checked={selected.has(row.id)} onChange={() => setSelected((current) => toggle(current, row.id))} /> : null}
                <div className="min-w-0 flex-1 space-y-1">
                  <RowBody row={row} />
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge label={row.band ?? "Not yet scored"} tone={row.band ? "good" : "neutral"} />
                    <StatusBadge label={LEAD_STATUS_LABELS[row.status as keyof typeof LEAD_STATUS_LABELS] ?? row.status} tone={leadStatusTone(row.status as never)} />
                    <StatusBadge label={row.clockLabel ?? RESPONSE_LABEL[row.responseState]} tone={RESPONSE_TONE[row.responseState]} />
                  </div>
                  <p className="text-sm text-muted-foreground">{row.nextStep ?? "No next step yet"}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.source ?? "Unknown source"} · {row.setterName || row.closerName || "Unassigned"} · Last touch {row.lastTouchAt ? formatQueueDuration(row.lastTouchAt, now) : "never"}
                    {row.lastTouchKind ? ` · ${row.lastTouchKind === "human" ? "a person" : "automated"}` : ""}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await fetchExperiencePage(filter, offset);
              if (!result.ok) return;
              setRows((current) => [...current, ...result.data.rows.filter((row) => !current.some((existing) => existing.id === row.id))]);
              setHasMore(result.data.hasMore);
              setOffset((value) => value + result.data.rows.length);
            })
          }
        >
          {pending ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}

function RowBody({ row }: { row: ExperienceRow }) {
  return (
    <div className="min-w-0">
      <Link href={`/app/cases/${row.id}`} className="font-medium text-foreground hover:underline">
        {row.name}
      </Link>
      <LeadLiveIndicator leadId={row.id} className="ml-2" />
      {row.headline ? <p className="truncate text-xs text-muted-foreground">{row.headline}</p> : null}
      <p className="mt-1 flex flex-wrap gap-1">
        {row.doNotContact || row.optedOut ? <Badge variant="error">Do not contact</Badge> : null}
        {row.fileStatus === "needs_review" || row.fileStatus === "held" ? <Badge variant="warning">Needs review</Badge> : null}
        {row.hasObjection ? <Badge variant="outline">Objection</Badge> : null}
        {row.agentOpen ? <Badge variant="info">Agent working</Badge> : null}
      </p>
    </div>
  );
}

function Select({ name, label, value, options, labels }: { name: string; label: string; value: string | null; options: string[]; labels?: Record<string, string> }) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <select name={name} defaultValue={value ?? ""} className="mt-1 block rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground">
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option} value={option}>{labels?.[option] ?? option.replaceAll("_", " ")}</option>
        ))}
      </select>
    </label>
  );
}

function SaveView({ filter, canShare }: { filter: ExperienceFilter; canShare: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        void saveLeadViewAction({ name, filters: filter, shared }).then((result) => {
          if (result.ok) {
            setName("");
            router.refresh();
          }
        });
      }}
    >
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Save this view" aria-label="View name" className="w-36" />
      {canShare ? (
        <label className="text-xs"><input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} /> Share</label>
      ) : null}
      <Button type="submit" size="sm" variant="outline" disabled={!name.trim()}>Save</Button>
    </form>
  );
}

function toggle(current: Set<string>, id: string) {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
