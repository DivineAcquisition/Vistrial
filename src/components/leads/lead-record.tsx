"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function LeadRecord({ leadId }: { leadId: string }) {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your workspace.</p>;
  return <LiveRecord workspaceId={shell.workspaceId} leadId={leadId as Id<"leads">} role={shell.role} />;
}

function LiveRecord({
  workspaceId,
  leadId,
  role,
}: {
  workspaceId: Id<"workspaces">;
  leadId: Id<"leads">;
  role: "owner" | "manager" | "rep";
}) {
  const lead = useQuery(api.leads.get, { workspaceId, leadId });
  const timeline = useQuery(api.records.timeline, { workspaceId, leadId });
  const notes = useQuery(api.records.listNotes, { workspaceId, leadId });
  const tasks = useQuery(api.records.listTasks, { workspaceId, leadId });
  const calls = useQuery(api.records.listCalls, { workspaceId, leadId });
  const bookings = useQuery(api.records.listBookings, { workspaceId, leadId });
  const messages = useQuery(api.records.listMessages, { workspaceId, leadId });
  const addNote = useMutation(api.records.addNote);
  const addTask = useMutation(api.records.addTask);
  const setConsent = useMutation(api.people.setConsent);
  const [note, setNote] = useState("");
  const [task, setTask] = useState("");
  const [reason, setReason] = useState("");

  if (lead === undefined) return <p className="text-sm text-muted-foreground">Loading.</p>;
  if (lead === null) return <p className="text-sm text-muted-foreground">Not found.</p>;

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-3xl gap-6">
      <PageHeader
        eyebrow="Lead"
        title={lead.name || "Unnamed"}
        description={`${lead.ownerName} · ${lead.stageName} · ${lead.source} · ${lead.status}`}
      />
      <Panel className="grid gap-3 p-6">
        <h2 className="font-heading text-base">Timeline</h2>
        <ul className="grid gap-2">
          {(timeline ?? []).map((row: { id: string; kind: string; refTable: string; at: number }) => (
            <li key={row.id} className="text-sm text-muted-foreground">
              {row.kind} · {row.refTable}
            </li>
          ))}
        </ul>
        {timeline && timeline.length === 0 ? <p className="text-sm text-muted-foreground">Nothing has happened yet.</p> : null}
      </Panel>
      <Panel className="grid gap-3 p-6">
        <h2 className="font-heading text-base">Notes</h2>
        <ul className="grid gap-2">
          {(notes ?? []).map((row: { id: string; body: string }) => (
            <li key={row.id} className="text-sm break-words text-foreground">
              {row.body}
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void addNote({ workspaceId, leadId, body: note }).then(() => setNote(""));
          }}
        >
          <Field label="Add a note" name="note-body">
            <Input id="note-body" name="note-body" type="text" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <Button type="submit">Save note</Button>
        </form>
      </Panel>
      <Panel className="grid gap-3 p-6">
        <h2 className="font-heading text-base">Tasks</h2>
        <ul className="grid gap-2">
          {(tasks ?? []).map((row: { id: string; title: string; status: string }) => (
            <li key={row.id} className="text-sm text-foreground">
              {row.title} · {row.status}
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void addTask({ workspaceId, leadId, title: task, purposeKey: "follow-up" }).then(() => setTask(""));
          }}
        >
          <Field label="Add a task" name="task-title">
            <Input id="task-title" name="task-title" type="text" value={task} onChange={(event) => setTask(event.target.value)} />
          </Field>
          <Button type="submit">Save task</Button>
        </form>
      </Panel>
      <Panel className="grid gap-2 p-6">
        <h2 className="font-heading text-base">Calls and bookings</h2>
        {(calls ?? []).map((row: { id: string; source: string }) => (
          <p key={row.id} className="text-sm text-muted-foreground">
            Call · {row.source}
          </p>
        ))}
        {(bookings ?? []).map((row: { id: string; status: string }) => (
          <p key={row.id} className="text-sm text-muted-foreground">
            Booking · {row.status}
          </p>
        ))}
        {(messages ?? []).map((row: { id: string; direction: string; channel: string }) => (
          <p key={row.id} className="text-sm text-muted-foreground">
            Message · {row.direction} · {row.channel}
          </p>
        ))}
      </Panel>
      <Panel className="grid gap-3 p-6">
        <h2 className="font-heading text-base">Team</h2>
        <p className="text-sm text-muted-foreground">Owner: {lead.ownerName}</p>
        <p className="text-sm text-muted-foreground">
          Email {lead.emailConsent}. Text {lead.textConsent}. Call {lead.callConsent}.
          {lead.doNotContact ? " Do not contact." : ""}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            void setConsent({
              workspaceId,
              personId: lead.personId as Id<"people">,
              channel: "all",
              next: "revoked",
              doNotContact: true,
            })
          }
        >
          Opt out
        </Button>
        {role === "rep" ? null : (
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void setConsent({
                workspaceId,
                personId: lead.personId as Id<"people">,
                channel: "all",
                next: "granted",
                doNotContact: false,
                reason,
              });
            }}
          >
            <Field label="Reason to clear an opt-out" name="clear-reason" help="Required. At least 8 characters.">
              <Input
                id="clear-reason"
                name="clear-reason"
                type="text"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <Button type="submit">Clear opt-out</Button>
          </form>
        )}
      </Panel>
      <EmptyState kind="empty" title="Scribe facts" detail="Nothing here yet." />
      <EmptyState kind="empty" title="Relay playbook" detail="Nothing here yet." />
      <EmptyState kind="empty" title="Sentry alerts" detail="Nothing here yet." />
    </div>
  );
}
