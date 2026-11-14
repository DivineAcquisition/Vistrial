"use client";

import type { FunctionReturnType } from "convex/server";
import { useState } from "react";

import { Plus, Quote, Users } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { showError } from "@/lib/errors/show-error";
import type { api } from "../../../convex/_generated/api";
import { OBJECTION_TAGS, type ObjectionTag } from "../../../convex/lib/playbook";

import { SectionTitle } from "./work-shell";

/** What `api.objectionPlaybook.view` returns. */
export type ObjectionData = FunctionReturnType<typeof api.objectionPlaybook.view>;
type Row = ObjectionData["rows"][number];
type Heard = ObjectionData["unmatched"][number];

export type ObjectionActions = {
  addStarter: () => Promise<unknown>;
  addHeard: (reviewId: string, title: string, tag: ObjectionTag) => Promise<unknown>;
};

const TAG_LABEL: Record<ObjectionTag, string> = { money: "Money", time: "Time", trust: "Trust", fit: "Fit" };

function day(at: number) {
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

async function run(action: () => Promise<unknown>) {
  try {
    await action();
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

function ObjectionRow({ row, isOwner }: { row: Row; isOwner: boolean }) {
  return (
    <li className="grid min-w-0 gap-3 rounded-lg border border-border p-3 sm:p-4" data-objection={row.itemId}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 text-sm font-medium break-words text-foreground">{row.title}</p>
        {row.tag ? (
          <Badge variant="outline" size="sm">
            {TAG_LABEL[row.tag]}
          </Badge>
        ) : null}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {row.heard || row.starter ? (
          <Badge variant={row.heard ? "success" : "warning"} size="sm">
            {row.heard ? "Your data" : "Untested hypothesis"}
          </Badge>
        ) : null}
        <span>
          {row.heardWords}
          {row.lastHeard ? `, last on ${day(row.lastHeard)}` : ""}
        </span>
      </p>
      {row.quotes.length ? (
        <section className="grid gap-1.5" aria-label="In the lead's own words">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">In the lead&apos;s own words</h4>
          <ul className="grid gap-1.5">
            {row.quotes.map((quote) => (
              <li key={`${quote.at}-${quote.quote}`} className="flex min-w-0 gap-2 text-sm text-foreground">
                <Quote aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 break-words">
                  “{quote.quote}”{" "}
                  <span className="text-xs text-muted-foreground">
                    Buyer&apos;s words{quote.leadName ? `, ${quote.leadName}` : ""}, {day(quote.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {row.workedWords ? (
        <section className="grid gap-1.5" aria-label="What worked">
          <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">What worked on your calls</h4>
          <p className="text-sm text-foreground">{row.workedWords}</p>
          {row.worked.length ? (
            <ul className="grid gap-1.5">
              {row.worked.map((item) => (
                <li key={`${item.at}-${item.answerQuote}`} className="min-w-0 text-sm break-words text-foreground">
                  “{item.answerQuote}” <span className="text-xs text-muted-foreground">Rep&apos;s words on a call later won, {day(item.at)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {isOwner && row.reps?.length ? (
        <section className="grid gap-1.5" aria-label="Per rep">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <Users aria-hidden className="size-3.5" />
            Per rep (only you see this)
          </h4>
          <ul className="grid gap-1">
            {row.reps.map((rep) => (
              <li key={rep.name} className="text-sm text-foreground">
                {rep.name}: heard on {rep.heard}, answered on {rep.answered}, {rep.won} later won
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </li>
  );
}

function HeardRow({ row, canEdit, actions }: { row: Heard; canEdit: boolean; actions: ObjectionActions }) {
  const [tag, setTag] = useState<ObjectionTag>("money");
  const [busy, setBusy] = useState(false);
  const reviewId = row.reviewId;
  return (
    <li className="grid min-w-0 gap-2 rounded-lg border border-border p-3">
      <p className="min-w-0 text-sm font-medium break-words text-foreground">{row.title}</p>
      <p className="min-w-0 text-xs break-words text-muted-foreground">
        Heard on {row.heard} call{row.heard === 1 ? "" : "s"}
        {row.quote ? <>. Buyer&apos;s words: “{row.quote}”</> : ". The closer's account, no quote."}
      </p>
      {canEdit && reviewId ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label={`Tag for ${row.title}`} value={tag} onChange={(event) => setTag(event.target.value as ObjectionTag)} options={OBJECTION_TAGS.map((item) => ({ value: item, label: TAG_LABEL[item] }))} />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await run(() => actions.addHeard(reviewId, row.title, tag));
              setBusy(false);
            }}
          >
            <Plus aria-hidden className="size-4" />
            Add to Objections
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** The Objection Playbook, shown in the Playbook's Objections folder. Counts and quotes come from your own calls. */
export function ObjectionPlaybookPanel({ data, actions }: { data: ObjectionData; actions: ObjectionActions }) {
  const [busy, setBusy] = useState(false);
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6" data-objection-playbook>
      <SectionTitle
        icon={Quote}
        aside={
          data.canEdit && data.starterMissing > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await run(actions.addStarter);
                setBusy(false);
              }}
            >
              <Plus aria-hidden className="size-4" />
              Add the starter set
            </Button>
          ) : null
        }
      >
        Dealmaker · Objection playbook
      </SectionTitle>
      <p className="text-sm text-muted-foreground">{data.callsWords} Counted from reviewed calls and the closer&apos;s notes as they come in.</p>
      {data.rows.length ? (
        <ul className="grid gap-3">
          {data.rows.map((row) => (
            <ObjectionRow key={row.itemId} row={row} isOwner={data.isOwner} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No objections in the Playbook yet.{data.canEdit ? " Add the starter set to begin; each one says it has not been heard on your calls until it is." : ""}
        </p>
      )}
      {data.unmatched.length ? (
        <section className="grid gap-2" aria-label="Heard on calls, not in your Playbook yet">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Heard on calls, not in your Playbook yet</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.unmatched.map((row) => (
              <HeardRow key={row.title} row={row} canEdit={data.canEdit} actions={actions} />
            ))}
          </ul>
        </section>
      ) : null}
    </Panel>
  );
}
