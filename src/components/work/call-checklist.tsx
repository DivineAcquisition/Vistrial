"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { ListChecks, MessageSquareWarning, Target, User } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Panel } from "@/components/ui/panel";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { SectionTitle } from "./work-shell";

export type ChecklistData = FunctionReturnType<typeof api.callChecklist.forCall>;
type Item = ChecklistData["lead"][number];

function Row({ item, on, canTick, onTick }: { item: Item; on: boolean; canTick: boolean; onTick: (on: boolean) => void }) {
  return (
    <li className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-card p-3" data-item={item.id}>
      <Checkbox checked={on} disabled={!canTick} onCheckedChange={(next) => onTick(Boolean(next))} aria-label={item.text} className="mt-0.5" />
      <div className="grid min-w-0 gap-0.5">
        <span className={on ? "text-sm text-muted-foreground line-through" : "text-sm text-foreground"}>{item.text}</span>
        {item.note ? <span className="text-xs text-muted-foreground">{item.note}</span> : null}
      </div>
    </li>
  );
}

/** The live checklist for one booked call: the script, this lead's points and the most-heard objections. */
export function ChecklistView({ data, onTick, onClose }: { data: ChecklistData; onTick: (itemId: string, on: boolean) => void; onClose?: () => void }) {
  const ticked = new Set(data.ticked);
  const total = data.script.reduce((sum, group) => sum + group.items.length, 0) + data.lead.length;
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <span className="text-xs font-medium text-muted-foreground">Dealmaker · Call checklist</span>
          <h1 className="font-heading text-xl text-foreground">{data.leadName}</h1>
          <span className="text-sm text-muted-foreground">{total ? `${data.ticked.length} of ${total} done. ` : ""}Tick items as you go. Nothing listens to the call.</span>
        </div>
        {onClose ? (
          <Button size="sm" variant="outline" onClick={onClose}>
            Back to calls
          </Button>
        ) : null}
      </div>

      <Panel className="grid min-w-0 gap-3 p-4 sm:p-6">
        <SectionTitle icon={ListChecks}>Your script</SectionTitle>
        {data.script.length ? (
          data.script.map((group) => (
            <div key={group.stage} className="grid gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.stage}</h3>
              <ul className="grid gap-2">
                {group.items.map((item) => (
                  <Row key={item.id} item={item} on={ticked.has(item.id)} canTick={data.canTick} onTick={(on) => onTick(item.id, on)} />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{data.scriptMissing}</p>
        )}
      </Panel>

      <Panel className="grid min-w-0 gap-3 p-4 sm:p-6">
        <SectionTitle icon={User}>For {data.leadName}</SectionTitle>
        {data.lead.length ? (
          <ul className="grid gap-2">
            {data.lead.map((item) => (
              <Row key={item.id} item={item} on={ticked.has(item.id)} canTick={data.canTick} onTick={(on) => onTick(item.id, on)} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{data.leadMissing}</p>
        )}
      </Panel>

      {data.objections.length ? (
        <Panel className="grid min-w-0 gap-3 p-4 sm:p-6">
          <SectionTitle icon={MessageSquareWarning}>Heard most on your calls</SectionTitle>
          <ul className="grid gap-2">
            {data.objections.map((row) => (
              <li key={row.title} className="grid min-w-0 gap-1 rounded-lg border border-border bg-card p-3">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{row.title}</span>
                  <Badge variant="outline" size="sm">
                    {row.heardWords}
                  </Badge>
                </div>
                {row.track ? (
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Target aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {row.track}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

/** Reads one call's checklist and saves ticks as they are made. */
export function OpenChecklist({ workspaceId, clientId, appointmentRef, onClose }: { workspaceId: Id<"workspaces">; clientId?: Id<"clients">; appointmentRef: string; onClose: () => void }) {
  const data = useQuery(api.callChecklist.forCall, { workspaceId, clientId, appointmentRef });
  const tick = useMutation(api.callChecklist.tick);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  if (data === undefined) return <p className="text-sm text-muted-foreground">Reading the checklist…</p>;
  // Show a tick at once; the saved list takes over when it arrives.
  const shown = new Set(data.ticked);
  for (const [id, on] of Object.entries(pending)) {
    if (on) shown.add(id);
    else shown.delete(id);
  }
  return (
    <ChecklistView
      data={{ ...data, ticked: [...shown] }}
      onClose={onClose}
      onTick={async (itemId, on) => {
        setPending((now) => ({ ...now, [itemId]: on }));
        try {
          await tick({ workspaceId, clientId, appointmentRef, itemId, on });
        } catch (error) {
          showError(error);
        } finally {
          setPending((now) => {
            const rest = { ...now };
            delete rest[itemId];
            return rest;
          });
        }
      }}
    />
  );
}
