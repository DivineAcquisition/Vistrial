"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";

import { BotIcon, CheckCircle2, Clock, Hand, Mail, MessageSquareText, PenLine, SendIcon, Sparkles, Trash2, User, XCircle, type LucideIcon } from "@/components/icons";
import { useClientScope } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { SectionTitle, WorkHero } from "./work-shell";

export type CommsData = FunctionReturnType<typeof api.comms.view>;
type Item = CommsData["lanes"][number]["items"][number];
type LaneId = CommsData["lanes"][number]["id"];
type Channel = "sms" | "email";
export type SubmitResult = {
  outcome: string;
  reason: string;
  doItYourself?: string;
};

export type CommsActions = {
  create: (input: { contactRef: string; dealRef?: string; kind: string; channel: Channel; title?: string; body: string }) => Promise<unknown>;
  update: (id: string, input: { channel: Channel; title?: string; body: string }) => Promise<unknown>;
  discard: (id: string) => Promise<unknown>;
  submit: (id: string) => Promise<SubmitResult>;
  /** Starts the Follow-up Engine once a person has seen the most it may use. */
  draftFollowUps: (confirmedCredits: number) => Promise<unknown>;
};

/** Colour is never alone: every lane has an icon and its word. */
const LANE_STYLE: Record<LaneId, { icon: LucideIcon; edge: string }> = {
  drafted: { icon: PenLine, edge: "border-l-info" },
  held: { icon: Hand, edge: "border-l-warning" },
  waiting: { icon: Clock, edge: "border-l-muted-foreground" },
  sent: { icon: CheckCircle2, edge: "border-l-success" },
  failed: { icon: XCircle, edge: "border-l-destructive" },
};

const CHANNEL_LABEL: Record<Channel, string> = {
  sms: "Text message",
  email: "Email",
};

/** What happened when a person sent a draft on, in words. */
const OUTCOME_WORDS: Record<string, string> = {
  proposed: "Waiting for approval.",
  sending: "Approved by your standing switch for this kind of message. It goes out with every send-time check.",
  held: "Held.",
  notProposed: "Not proposed.",
};

async function run<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    showError(error);
    return undefined;
  }
}

type Limits = CommsData["limits"];

/** The message fields, shared by writing a new one and editing a draft. */
function MessageFields({
  id,
  limits,
  channel,
  title,
  body,
  onTitle,
  onBody,
}: {
  id: string;
  limits: Limits;
  channel: Channel;
  title: string;
  body: string;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
}) {
  const limit = channel === "sms" ? limits.sms : limits.email;
  return (
    <>
      {channel === "email" ? (
        <label className="grid gap-1 text-xs text-muted-foreground" htmlFor={`subject-${id}`}>
          Subject
          <Input id={`subject-${id}`} value={title} maxLength={limits.title} onChange={(event) => onTitle(event.target.value)} />
        </label>
      ) : null}
      <label className="grid gap-1 text-xs text-muted-foreground" htmlFor={`body-${id}`}>
        Message
        <Textarea id={`body-${id}`} rows={channel === "sms" ? 3 : 6} value={body} maxLength={limit} onChange={(event) => onBody(event.target.value)} />
        <span className={cn("justify-self-end tabular-nums", body.length > limit * 0.9 && "text-warning")}>
          {body.length} / {limit}
        </span>
      </label>
    </>
  );
}

function MessageCard({ item, lane, limits, editor, actions }: { item: Item; lane: LaneId; limits: Limits; editor: boolean; actions: CommsActions }) {
  const [editing, setEditing] = useState(false);
  const [channel, setChannel] = useState<Channel>(item.channel);
  const [title, setTitle] = useState(item.title ?? "");
  const [body, setBody] = useState(item.body);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const open = editor && (lane === "drafted" || lane === "held");
  const ChannelIcon = item.channel === "sms" ? MessageSquareText : Mail;

  async function act<T>(action: () => Promise<T>) {
    setBusy(true);
    const value = await run(action);
    setBusy(false);
    return value;
  }

  return (
    <li className={cn("grid min-w-0 gap-2 rounded-lg border border-l-4 border-border bg-card p-3", LANE_STYLE[lane].edge)} data-message={item.id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">{item.leadName}</span>
        <Badge variant="outline" size="sm">
          {item.kindLabel}
        </Badge>
        <Badge variant="outline" size="sm">
          <ChannelIcon aria-hidden className="size-3" />
          {CHANNEL_LABEL[item.channel]}
        </Badge>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          {item.byDealmaker ? <BotIcon aria-hidden className="size-3.5" /> : <User aria-hidden className="size-3.5" />}
          {item.byDealmaker ? "Drafted by Dealmaker" : "Written by your team"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{item.why}</p>
      {editing ? (
        <div className="grid gap-2">
          <Select
            aria-label="Channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value as Channel)}
            options={[
              { value: "sms", label: CHANNEL_LABEL.sms },
              { value: "email", label: CHANNEL_LABEL.email },
            ]}
          />
          <MessageFields id={item.id} limits={limits} channel={channel} title={title} body={body} onTitle={setTitle} onBody={setBody} />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !body.trim() || (channel === "email" && !title.trim())}
              onClick={async () => {
                const done = await act(() =>
                  actions.update(item.id, {
                    channel,
                    ...(channel === "email" ? { title } : {}),
                    body,
                  }),
                );
                if (done !== undefined) setEditing(false);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-1 rounded-md bg-muted/40 p-2.5">
          {item.title ? <p className="text-sm font-medium text-foreground">{item.title}</p> : null}
          <p className="text-sm whitespace-pre-wrap text-foreground">{item.body}</p>
        </div>
      )}
      {item.note ? <p className="text-xs text-foreground">{item.note}</p> : null}
      {lane === "waiting" ? (
        <p className="text-xs text-muted-foreground">
          A person approves or declines it in{" "}
          <Link href="/app/connections" className="text-primary underline-offset-2 hover:underline">
            Connections
          </Link>
          . Quiet hours, Do Not Disturb and one message a day still apply when it goes.
        </p>
      ) : null}
      {result ? (
        <p className="text-xs text-foreground" role="status">
          {OUTCOME_WORDS[result.outcome] ?? ""} {result.reason} {result.doItYourself ?? ""}
        </p>
      ) : null}
      {open && !editing ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              const value = await act(() => actions.submit(item.id));
              if (value) setResult(value);
            }}
          >
            <SendIcon aria-hidden className="size-3.5" />
            Send for approval
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
            <PenLine aria-hidden className="size-3.5" />
            Edit
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => actions.discard(item.id))}>
            <Trash2 aria-hidden className="size-3.5" />
            Discard
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function Compose({ data, actions }: { data: CommsData; actions: CommsActions }) {
  const [contactRef, setContactRef] = useState("");
  const [kind, setKind] = useState("followUp");
  const [channel, setChannel] = useState<Channel>("sms");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const lead = data.leads.find((row) => row.contactRef === contactRef) ?? null;
  const reachable = lead ? (channel === "sms" ? lead.sms : lead.email) : true;

  function pickLead(ref: string) {
    setContactRef(ref);
    const next = data.leads.find((row) => row.contactRef === ref);
    if (next && !next.sms && next.email) setChannel("email");
    if (next && next.sms && !next.email) setChannel("sms");
  }

  if (!data.leads.length) return <p className="text-sm text-muted-foreground">No lead has an open deal in your CRM, so there is nobody to write to yet.</p>;
  return (
    <div className="grid gap-2" data-compose>
      <div className="grid gap-2 sm:grid-cols-3">
        <Select
          aria-label="Lead"
          value={contactRef}
          onChange={(event) => pickLead(event.target.value)}
          options={[
            { value: "", label: "Choose a lead" },
            ...data.leads.map((row) => ({
              value: row.contactRef,
              label: row.name,
            })),
          ]}
        />
        <Select
          aria-label="Kind of message"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          options={data.kinds.map((row) => ({
            value: row.id,
            label: row.label,
          }))}
        />
        <Select
          aria-label="Channel"
          value={channel}
          onChange={(event) => setChannel(event.target.value as Channel)}
          options={[
            {
              value: "sms",
              label: CHANNEL_LABEL.sms,
              disabled: lead ? !lead.sms : false,
            },
            {
              value: "email",
              label: CHANNEL_LABEL.email,
              disabled: lead ? !lead.email : false,
            },
          ]}
        />
      </div>
      {lead && !reachable ? (
        <p className="text-xs text-warning">
          Your CRM has no {channel === "sms" ? "phone number" : "email address"} for {lead.name}.
        </p>
      ) : null}
      <MessageFields id="new" limits={data.limits} channel={channel} title={title} body={body} onTitle={setTitle} onBody={setBody} />
      <div>
        <Button
          size="sm"
          disabled={busy || !lead || !reachable || !body.trim() || (channel === "email" && !title.trim())}
          onClick={async () => {
            if (!lead) return;
            setBusy(true);
            const done = await run(() =>
              actions.create({
                contactRef: lead.contactRef,
                dealRef: lead.dealRef,
                kind,
                channel,
                ...(channel === "email" ? { title } : {}),
                body,
              }),
            );
            setBusy(false);
            if (done !== undefined) {
              setBody("");
              setTitle("");
            }
          }}
        >
          Save draft
        </Button>
      </div>
    </div>
  );
}

/** Comms with its data handed in, so a story can show it without a server. */
/** Dealmaker drafts the next message for every deal that needs one; a person confirms the most it may use first. */
function DraftFollowUps({ maxCredits, actions }: { maxCredits: number; actions: CommsActions }) {
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "started">("idle");
  return (
    <div className="grid gap-2" data-draft-follow-ups>
      <p className="text-sm text-muted-foreground">
        Dealmaker reads your pipeline and drafts the one next message each deal needs: a reply that is ours, something promised, a new time after a missed call, an honest check-in, or a first hello.
        Drafts land under Drafted. Nothing is sent.
      </p>
      {state === "started" ? (
        <p className="text-sm text-foreground" role="status">
          Drafting now. New drafts appear under Drafted when they are ready.
        </p>
      ) : state === "idle" ? (
        <div>
          <Button size="sm" onClick={() => setState("confirm")}>
            <Sparkles aria-hidden className="size-3.5" />
            Draft follow-ups
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={state === "busy"}
            onClick={async () => {
              setState("busy");
              const done = await run(() => actions.draftFollowUps(maxCredits));
              setState(done === undefined ? "confirm" : "started");
            }}
          >
            Draft them now
          </Button>
          <Button size="sm" variant="outline" disabled={state === "busy"} onClick={() => setState("idle")}>
            Cancel
          </Button>
          <span className="text-xs text-muted-foreground">Up to {maxCredits} credits for this round. Nothing runs until you press it.</span>
        </div>
      )}
    </div>
  );
}

export function CommsView({ data, maxCredits, editor, actions }: { data: CommsData; maxCredits: number | null; editor: boolean; actions: CommsActions }) {
  const canEdit = editor && data.canEdit;
  const [lane, setLane] = useState<LaneId>("drafted");
  const shown = data.lanes.find((row) => row.id === lane) ?? data.lanes[0];
  return (
    <div className="grid min-w-0 gap-5">
      <WorkHero
        icon={MessageSquareText}
        agent="sales-conversion"
        eyebrow="Dealmaker · Comms"
        title="Every message to a lead, and where it stands"
        promise="Drafts wait here until a person sends them on. Nothing reaches a lead without approval, except the low-stakes kinds the Owner chose, and every send-time check still applies."
      />
      {!data.connected ? (
        <Panel className="grid gap-2 p-4 sm:p-6">
          <p className="text-sm text-muted-foreground">Connect your CRM in Connections and Dealmaker can draft messages to your leads here.</p>
        </Panel>
      ) : !data.messaging ? (
        <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm text-foreground" role="note">
          Messaging is off in{" "}
          <Link href="/app/connections" className="text-primary underline-offset-2 hover:underline">
            Connections
          </Link>
          . You can still draft here, then copy the text and send it yourself.
        </p>
      ) : null}
      {canEdit && data.connected && maxCredits !== null ? (
        <Panel className="grid gap-3 p-4 sm:p-6">
          <SectionTitle icon={Sparkles}>Follow-ups</SectionTitle>
          <DraftFollowUps maxCredits={maxCredits} actions={actions} />
        </Panel>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Messages by where they stand">
        {data.lanes.map((row) => {
          const Icon = LANE_STYLE[row.id].icon;
          const active = row.id === lane;
          return (
            <button
              key={row.id}
              type="button"
              aria-pressed={active}
              onClick={() => setLane(row.id)}
              className={cn("flex w-full items-center gap-2 rounded-lg border border-l-4 border-border bg-card px-3 py-2 text-left", LANE_STYLE[row.id].edge, active && "ring-2 ring-primary/40")}
            >
              <Icon aria-hidden className="size-4 text-muted-foreground" />
              <span className="text-sm text-foreground">{row.label}</span>
              <span className="ml-auto font-heading text-lg text-foreground tabular-nums">{row.items.length}</span>
            </button>
          );
        })}
      </div>
      <Panel className="grid gap-3 p-4 sm:p-6" data-lane={shown.id}>
        <SectionTitle icon={LANE_STYLE[shown.id].icon}>{shown.label}</SectionTitle>
        {shown.items.length ? (
          <ul className="grid gap-2">
            {shown.items.map((item) => (
              <MessageCard key={item.id} item={item} lane={shown.id} limits={data.limits} editor={canEdit} actions={actions} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing here.</p>
        )}
      </Panel>
      {canEdit && data.connected ? (
        <Panel className="grid gap-3 p-4 sm:p-6">
          <SectionTitle icon={PenLine}>Write a message</SectionTitle>
          <Compose data={data} actions={actions} />
        </Panel>
      ) : null}
    </div>
  );
}

/** Dealmaker's Comms for the organization or the client the picker names. */
export function CommsTab({ workspaceId, editor }: { workspaceId: Id<"workspaces">; editor: boolean }) {
  const { clientId } = useClientScope();
  const data = useQuery(api.comms.view, { workspaceId, clientId });
  const create = useMutation(api.comms.createDraft);
  const update = useMutation(api.comms.updateDraft);
  const discard = useMutation(api.comms.discardDraft);
  const submit = useMutation(api.comms.submitDraft);
  const quote = useQuery(api.dealFollowUps.quote, editor ? { workspaceId } : "skip");
  const draftFollowUps = useMutation(api.dealFollowUps.draft);
  if (data === undefined) return <p className="text-sm text-muted-foreground">Reading your messages…</p>;
  const actions: CommsActions = {
    create: (input) => create({ workspaceId, clientId, ...input }),
    update: (id, input) => update({ workspaceId, draftId: id as Id<"dealmakerDrafts">, ...input }),
    discard: (id) => discard({ workspaceId, draftId: id as Id<"dealmakerDrafts"> }),
    submit: (id) => submit({ workspaceId, draftId: id as Id<"dealmakerDrafts"> }),
    draftFollowUps: (confirmedCredits) => draftFollowUps({ workspaceId, clientId, confirmedCredits }),
  };
  return <CommsView data={data} maxCredits={quote?.maxCredits ?? null} editor={editor} actions={actions} />;
}
