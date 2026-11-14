"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";

import { BotIcon, CheckCircle2, Clock, Hand, Loader2, Mail, MessageSquareText, Mic, PenLine, SendIcon, Sparkles, Trash2, User, XCircle, type LucideIcon } from "@/components/icons";
import { useClientScope } from "@/components/shell/shell-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { showError } from "@/lib/errors/show-error";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { VoiceSetup, type VoiceActions, type VoiceStatus } from "./voice-setup";
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
  create: (input: { contactRef: string; dealRef?: string; kind: string; channel: Channel; title?: string; body: string; voice?: boolean }) => Promise<unknown>;
  update: (id: string, input: { channel: Channel; title?: string; body: string; voice?: boolean }) => Promise<unknown>;
  /** Makes a voice note's audio for its exact words. */
  makeAudio: (id: string) => Promise<unknown>;
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
  voice = false,
}: {
  id: string;
  voice?: boolean;
  limits: Limits;
  channel: Channel;
  title: string;
  body: string;
  onTitle: (value: string) => void;
  onBody: (value: string) => void;
}) {
  const limit = voice ? limits.voice : channel === "sms" ? limits.sms : limits.email;
  return (
    <>
      {channel === "email" ? (
        <label className="grid gap-1 text-xs text-muted-foreground" htmlFor={`subject-${id}`}>
          Subject
          <Input id={`subject-${id}`} value={title} maxLength={limits.title} onChange={(event) => onTitle(event.target.value)} />
        </label>
      ) : null}
      <label className="grid gap-1 text-xs text-muted-foreground" htmlFor={`body-${id}`}>
        {voice ? "What the voice note says, about forty seconds at most" : "Message"}
        <Textarea id={`body-${id}`} rows={channel === "sms" ? 3 : 6} value={body} maxLength={limit} onChange={(event) => onBody(event.target.value)} />
        <span className={cn("justify-self-end tabular-nums", body.length > limit * 0.9 && "text-warning")}>
          {body.length} / {limit}
        </span>
      </label>
    </>
  );
}

/** A voice note's audio: the player once made, or why it is not. */
function VoiceAudio({ item, open, voiceProblem, busy, onMake }: { item: Item; open: boolean; voiceProblem: string | null; busy: boolean; onMake: () => void }) {
  const audio = item.audio;
  if (!audio) return null;
  return (
    <div className="grid gap-1.5" data-voice-note>
      {audio.url ? (
        <audio controls preload="none" src={audio.url} className="w-full max-w-md">
          <track kind="captions" />
        </audio>
      ) : null}
      {audio.status === "making" ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
          The voice note is being made.
        </p>
      ) : null}
      {audio.problem ? <p className="text-xs text-foreground">{audio.problem}</p> : null}
      {open && voiceProblem ? <p className="text-xs text-foreground">{voiceProblem}</p> : null}
      {open && !voiceProblem && audio.status !== "making" ? (
        <div>
          <Button size="sm" variant="outline" disabled={busy} onClick={onMake}>
            <Mic aria-hidden className="size-3.5" />
            {audio.status === "ready" ? "Make it again" : "Make the voice note"}
          </Button>
        </div>
      ) : null}
      {open && audio.status !== "ready" && !voiceProblem ? <p className="text-xs text-muted-foreground">Make it and listen to it before you send it on.</p> : null}
    </div>
  );
}

function MessageCard({ item, lane, limits, voiceProblem, editor, actions }: { item: Item; lane: LaneId; limits: Limits; voiceProblem: string | null; editor: boolean; actions: CommsActions }) {
  const [editing, setEditing] = useState(false);
  const [voice, setVoice] = useState(item.voice);
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
        {item.voice ? (
          <Badge variant="outline" size="sm">
            <Mic aria-hidden className="size-3" />
            Voice note
          </Badge>
        ) : null}
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
          <CheckboxField
            label="Send as a voice note"
            description="The words are spoken in your cloned voice and attached as audio."
            checked={voice}
            onCheckedChange={(next) => setVoice(next === true)}
          />
          <MessageFields id={item.id} voice={voice} limits={limits} channel={channel} title={title} body={body} onTitle={setTitle} onBody={setBody} />
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
                    voice,
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
      {editing ? null : <VoiceAudio item={item} open={open} voiceProblem={voiceProblem} busy={busy} onMake={() => void act(() => actions.makeAudio(item.id))} />}
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
  const [voice, setVoice] = useState(false);
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
      <CheckboxField
        label="Send as a voice note"
        description={data.voiceProblem ?? "The words are spoken in your cloned voice and attached as audio. A person approves every voice note."}
        checked={voice}
        onCheckedChange={(next) => setVoice(next === true)}
      />
      <MessageFields id="new" voice={voice} limits={data.limits} channel={channel} title={title} body={body} onTitle={setTitle} onBody={setBody} />
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
                ...(voice ? { voice: true } : {}),
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

export function CommsView({
  data,
  maxCredits,
  voice,
  editor,
  actions,
  voiceActions,
}: {
  data: CommsData;
  maxCredits: number | null;
  /** The cloned voice for voice notes, when it has loaded. */
  voice: VoiceStatus | null;
  editor: boolean;
  actions: CommsActions;
  voiceActions: VoiceActions;
}) {
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
              <MessageCard key={item.id} item={item} lane={shown.id} limits={data.limits} voiceProblem={data.voiceProblem} editor={canEdit} actions={actions} />
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
      {voice ? (
        <Panel className="grid gap-3 p-4 sm:p-6">
          <SectionTitle icon={Mic}>Your voice</SectionTitle>
          <VoiceSetup status={voice} actions={voiceActions} />
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
  const makeAudio = useMutation(api.voiceNotes.makeAudio);
  const voice = useQuery(api.voiceNotes.status, { workspaceId, clientId });
  const uploadUrl = useMutation(api.voiceNotes.sampleUploadUrl);
  const recordVoice = useMutation(api.voiceNotes.recordVoice);
  const retryVoice = useMutation(api.voiceNotes.retryVoice);
  const removeVoice = useMutation(api.voiceNotes.removeVoice);
  if (data === undefined) return <p className="text-sm text-muted-foreground">Reading your messages…</p>;
  const actions: CommsActions = {
    create: (input) => create({ workspaceId, clientId, ...input }),
    update: (id, input) => update({ workspaceId, draftId: id as Id<"dealmakerDrafts">, ...input }),
    discard: (id) => discard({ workspaceId, draftId: id as Id<"dealmakerDrafts"> }),
    submit: (id) => submit({ workspaceId, draftId: id as Id<"dealmakerDrafts"> }),
    draftFollowUps: (confirmedCredits) => draftFollowUps({ workspaceId, clientId, confirmedCredits }),
    makeAudio: (id) => makeAudio({ workspaceId, draftId: id as Id<"dealmakerDrafts"> }),
  };
  const voiceActions: VoiceActions = {
    record: async ({ speakerName, typedName, recording }) => {
      const url = await uploadUrl({ workspaceId });
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": recording.blob.type || "audio/webm" }, body: recording.blob });
      if (!response.ok) throw new Error("The recording could not be uploaded. Try again.");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      const result = await recordVoice({ workspaceId, clientId, speakerName, typedName, storageId, seconds: recording.seconds });
      return result.ok ? null : result.reason;
    },
    retry: () => retryVoice({ workspaceId, clientId }),
    remove: () => removeVoice({ workspaceId, clientId }),
  };
  return <CommsView data={data} maxCredits={quote?.maxCredits ?? null} voice={voice ?? null} editor={editor} actions={actions} voiceActions={voiceActions} />;
}
