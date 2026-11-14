"use client";

import { AlertTriangle, Check, Clock, Hand, Lock, RotateCcw, ShieldCheck, X } from "@/components/icons";
import { useId, useState } from "react";

import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { selectClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export type ActionKind = "move_stage" | "set_status" | "add_tag" | "remove_tag" | "add_note" | "create_task" | "send_sms" | "send_email";

/** What `crmActions.list` returns. */
export type HighLevelActionsData = {
  connected: boolean;
  enabled: boolean;
  /** An Owner stopped every CRM action across the organization. */
  organizationOff: boolean;
  messaging: { enabled: boolean; consentAt: number | null };
  can: { toggle: boolean; propose: boolean; approve: boolean; approveRestricted: boolean };
  actions: {
    id: string;
    kind: ActionKind;
    summary: string;
    why: string;
    lead: string | null;
    body: string | null;
    state: "proposed" | "approved" | "running" | "done" | "failed" | "declined" | "expired" | "cancelled";
    restricted: { word: string; why: string } | null;
    mayTriggerAutomation: boolean;
    proposedBy: string;
    proposedAt: number;
    decidedAt: number | null;
    doneAt: number | null;
    resultCode: string | null;
    /** For a message: what was checked just before sending. */
    checks: { at: number; dnd: boolean; timezone?: string; localHour?: number; consent: string; result: string } | null;
    canUndo: boolean;
    undone: boolean;
  }[];
  deals: { id: string; pipelineId: string; stage: string; stageId: string; value: number; lead: string }[];
  leads: { id: string; name: string; tags: string[]; phone: boolean; email: boolean }[];
  stages: { pipelineId: string; name: string; stages: { id: string; name: string }[] }[];
};

export type ProposeInput = {
  kind: ActionKind;
  dealId?: string;
  contactId?: string;
  stageId?: string;
  status?: string;
  tag?: string;
  title?: string;
  body?: string;
  dueAt?: number;
  why: string;
};

export type HighLevelActionsHandlers = {
  setActing: (on: boolean) => Promise<void>;
  setMessaging: (on: boolean, consentConfirmed: boolean) => Promise<string | null>;
  setOrganization: (on: boolean) => Promise<void>;
  propose: (input: ProposeInput) => Promise<string | null>;
  decide: (actionId: string, approve: boolean, confirmWord?: string) => Promise<string | null>;
  undo: (actionId: string) => Promise<string | null>;
};

const KIND_WORDS: Record<ActionKind, string> = {
  move_stage: "Move a deal to another stage",
  set_status: "Mark a deal won, lost or abandoned",
  add_tag: "Add a tag to a lead",
  remove_tag: "Remove a tag from a lead",
  add_note: "Add a note to a lead",
  create_task: "Create a task on a lead",
  send_sms: "Text a lead",
  send_email: "Email a lead",
};

/** Why an action was not done, in plain words. */
const RESULT_WORDS: Record<string, string> = {
  opted_out: "The lead is on Do Not Disturb or opted out in HighLevel. Nothing was sent.",
  quiet_hours: "It was outside 8 am to 8 pm in the lead's time. Nothing was sent.",
  no_timezone: "The lead's local time is not known. Nothing was sent.",
  no_address: "The lead has no address for that message. Nothing was sent.",
  unreadable: "HighLevel did not return the lead. Nothing was sent.",
  too_soon: "Vistrial already messaged this lead in the last day. Nothing was sent.",
  bad_request: "HighLevel did not accept the change.",
  not_found: "HighLevel could not find the deal or lead.",
  permission_missing: "HighLevel refused: the app lacks permission.",
  token_rejected: "HighLevel no longer accepts the connection.",
  acting_off: "Acting was turned off before it ran.",
};

const STATE_BADGE: Record<HighLevelActionsData["actions"][number]["state"], { label: string; tone: "good" | "warning" | "neutral" | "brand" | "critical" }> = {
  proposed: { label: "Waiting for approval", tone: "brand" },
  approved: { label: "Approved", tone: "brand" },
  running: { label: "Sending", tone: "brand" },
  done: { label: "Done in HighLevel", tone: "good" },
  failed: { label: "Not done", tone: "warning" },
  declined: { label: "Declined", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function when(time: number) {
  return new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function money(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

const field = "grid gap-1.5 text-sm";

function ProposeForm({ data, onPropose }: { data: HighLevelActionsData; onPropose: HighLevelActionsHandlers["propose"] }) {
  const id = useId();
  const [kind, setKind] = useState<ActionKind>("move_stage");
  const [dealId, setDealId] = useState(data.deals[0]?.id ?? "");
  const [contactId, setContactId] = useState(data.leads[0]?.id ?? "");
  const [stageId, setStageId] = useState("");
  const [status, setStatus] = useState("won");
  const [tag, setTag] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "good" | "warning" } | null>(null);

  const forDeal = kind === "move_stage" || kind === "set_status";
  const deal = data.deals.find((row) => row.id === dealId);
  const stages = data.stages.find((row) => row.pipelineId === deal?.pipelineId)?.stages.filter((stage) => stage.id !== deal?.stageId) ?? [];
  const lead = data.leads.find((row) => row.id === contactId);

  const submit = async () => {
    setBusy(true);
    const input: ProposeInput = forDeal
      ? { kind, dealId, why, ...(kind === "move_stage" ? { stageId: stageId || stages[0]?.id } : { status }) }
      : {
          kind,
          contactId,
          why,
          ...(kind === "add_tag" || kind === "remove_tag" ? { tag } : {}),
          ...(kind === "add_note" || kind === "send_sms" ? { body } : {}),
          ...(kind === "send_email" ? { title, body } : {}),
          ...(kind === "create_task" ? { title, body: body || undefined, dueAt: due ? new Date(`${due}T09:00:00`).getTime() : undefined } : {}),
        };
    const problem = await onPropose(input);
    setBusy(false);
    if (problem) setMessage({ text: problem, tone: "warning" });
    else {
      setMessage({ text: "Proposed. It waits for an Owner or Admin; nothing has changed in HighLevel.", tone: "good" });
      setWhy("");
      setTag("");
      setTitle("");
      setBody("");
    }
  };

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-background/60 p-4">
      <p className="text-sm font-medium text-card-foreground">Propose a change</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field} htmlFor={`${id}-kind`}>
          <span>What</span>
          <select id={`${id}-kind`} className={selectClass} value={kind} onChange={(event) => setKind(event.target.value as ActionKind)}>
            {(Object.keys(KIND_WORDS) as ActionKind[])
              .filter((key) => data.messaging.enabled || (key !== "send_sms" && key !== "send_email"))
              .map((key) => (
              <option key={key} value={key}>
                {KIND_WORDS[key]}
              </option>
            ))}
          </select>
        </label>
        {forDeal ? (
          <label className={field} htmlFor={`${id}-deal`}>
            <span>Deal</span>
            <select id={`${id}-deal`} className={selectClass} value={dealId} onChange={(event) => setDealId(event.target.value)}>
              {data.deals.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.lead} · {row.stage} · {money(row.value)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className={field} htmlFor={`${id}-lead`}>
            <span>Lead</span>
            <select id={`${id}-lead`} className={selectClass} value={contactId} onChange={(event) => setContactId(event.target.value)}>
              {data.leads.filter((row) => (kind === "send_sms" ? row.phone : kind === "send_email" ? row.email : true)).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "move_stage" ? (
          <label className={field} htmlFor={`${id}-stage`}>
            <span>Move to</span>
            <select id={`${id}-stage`} className={selectClass} value={stageId || stages[0]?.id || ""} onChange={(event) => setStageId(event.target.value)}>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {kind === "set_status" ? (
          <label className={field} htmlFor={`${id}-status`}>
            <span>Mark as</span>
            <select id={`${id}-status`} className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
              <option value="abandoned">Abandoned</option>
              <option value="open">Open again</option>
            </select>
          </label>
        ) : null}
        {kind === "add_tag" || kind === "remove_tag" ? (
          kind === "remove_tag" && lead && lead.tags.length > 0 ? (
            <label className={field} htmlFor={`${id}-tag`}>
              <span>Tag</span>
              <select id={`${id}-tag`} className={selectClass} value={tag || lead.tags[0]} onChange={(event) => setTag(event.target.value)}>
                {lead.tags.map((row) => (
                  <option key={row} value={row}>
                    {row}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className={field} htmlFor={`${id}-tag`}>
              <span>Tag</span>
              <Input id={`${id}-tag`} value={tag} maxLength={60} onChange={(event) => setTag(event.target.value)} placeholder="estimate-booked" />
            </label>
          )
        ) : null}
        {kind === "send_email" ? (
          <label className={field} htmlFor={`${id}-subject`}>
            <span>Subject</span>
            <Input id={`${id}-subject`} value={title} maxLength={150} onChange={(event) => setTitle(event.target.value)} placeholder="Your estimate" />
          </label>
        ) : null}
        {kind === "create_task" ? (
          <>
            <label className={field} htmlFor={`${id}-title`}>
              <span>Task</span>
              <Input id={`${id}-title`} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="Send the estimate" />
            </label>
            <label className={field} htmlFor={`${id}-due`}>
              <span>Due</span>
              <Input id={`${id}-due`} type="date" value={due} onChange={(event) => setDue(event.target.value)} />
            </label>
          </>
        ) : null}
      </div>
      {kind === "add_note" || kind === "create_task" || kind === "send_sms" || kind === "send_email" ? (
        <label className={field} htmlFor={`${id}-body`}>
          <span>{kind === "add_note" ? "Note" : kind === "send_sms" ? "Text" : kind === "send_email" ? "Email" : "Details (optional)"}</span>
          <textarea
            id={`${id}-body`}
            value={body}
            rows={3}
            maxLength={kind === "send_sms" ? 640 : kind === "send_email" ? 5000 : 2000}
            className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
      ) : null}
      <label className={field} htmlFor={`${id}-why`}>
        <span>Why, in a sentence</span>
        <Input id={`${id}-why`} value={why} maxLength={300} onChange={(event) => setWhy(event.target.value)} placeholder="She booked an estimate on the phone." />
      </label>
      {kind === "send_sms" || kind === "send_email" ? (
        <p className="text-xs text-muted-foreground">
          Only an Owner can approve it, by typing SEND. Just before sending, Vistrial reads the lead from HighLevel again and does not send if they opted out, if it is between 8 pm and 8 am their time, or if Vistrial messaged them in the last day.
        </p>
      ) : null}
      {message ? <Banner compact tone={message.tone} title={message.text} /> : null}
      <Button className="w-fit" onClick={() => void submit()} loading={busy} disabled={!why.trim()}>
        <Hand aria-hidden className="size-4" /> Propose
      </Button>
    </div>
  );
}

function ActionRow({ action, can, handlers }: { action: HighLevelActionsData["actions"][number]; can: HighLevelActionsData["can"]; handlers: HighLevelActionsHandlers }) {
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "decline" | "undo">(null);
  const [problem, setProblem] = useState<string | null>(null);
  const badge = STATE_BADGE[action.state];
  const waiting = action.state === "proposed";
  const mayApprove = waiting && (action.restricted ? can.approveRestricted : can.approve);
  const run = async (which: "approve" | "decline" | "undo") => {
    setBusy(which);
    const result = which === "undo" ? await handlers.undo(action.id) : await handlers.decide(action.id, which === "approve", action.restricted ? word : undefined);
    setBusy(null);
    setProblem(result);
  };
  return (
    <li className="grid gap-2 rounded-xl border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <p className="text-sm text-card-foreground">{action.summary.replace(/^HighLevel: /, "").replace(/^./, (c) => c.toUpperCase())}</p>
          <p className="text-xs text-muted-foreground">
            {action.lead ? `${action.lead} · ` : ""}
            Proposed by {action.proposedBy === "person" ? "a person" : action.proposedBy} · {when(action.proposedAt)}
            {action.undone ? " · Undone" : ""}
          </p>
        </div>
        <StatusBadge label={badge.label} tone={badge.tone} className="shrink-0 [&_span]:normal-case" />
      </div>
      <p className="text-sm text-muted-foreground">{action.why}</p>
      {action.body ? <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm whitespace-pre-wrap text-card-foreground">{action.body}</p> : null}
      {action.checks ? (
        <p className="text-xs text-muted-foreground">
          Checked {when(action.checks.at)}: {action.checks.dnd ? "on Do Not Disturb" : "not opted out"}
          {action.checks.localHour !== undefined ? ` · ${action.checks.localHour}:00 their time` : ""} · {action.checks.consent}.
        </p>
      ) : null}
      {action.state === "failed" || action.state === "cancelled" ? (
        action.resultCode && RESULT_WORDS[action.resultCode] ? <p className="text-xs text-muted-foreground">{RESULT_WORDS[action.resultCode]}</p> : null
      ) : null}
      {waiting && action.mayTriggerAutomation ? (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          This may start a workflow set up in HighLevel, which can text or email the lead. Vistrial cannot see workflows.
        </p>
      ) : null}
      {waiting && action.restricted ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {action.restricted.why} Only an Owner can approve it, by typing {action.restricted.word}.
        </p>
      ) : null}
      {problem ? <Banner compact tone="warning" title={problem} /> : null}
      {mayApprove || (waiting && can.approve) || action.canUndo ? (
        <div className="flex flex-wrap items-center gap-2">
          {mayApprove && action.restricted ? (
            <Input aria-label={`Type ${action.restricted.word} to approve`} value={word} onChange={(event) => setWord(event.target.value)} placeholder={action.restricted.word} className="w-32" />
          ) : null}
          {mayApprove ? (
            <Button size="sm" onClick={() => void run("approve")} loading={busy === "approve"} disabled={Boolean(action.restricted) && word.trim() !== action.restricted?.word}>
              <Check aria-hidden className="size-3.5" /> Approve
            </Button>
          ) : null}
          {waiting && can.approve ? (
            <Button size="sm" variant="ghost" onClick={() => void run("decline")} loading={busy === "decline"}>
              <X aria-hidden className="size-3.5" /> Decline
            </Button>
          ) : null}
          {action.canUndo && can.propose ? (
            <Button size="sm" variant="outline" onClick={() => void run("undo")} loading={busy === "undo"}>
              <RotateCcw aria-hidden className="size-3.5" /> Propose undo
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Acting in HighLevel: the Owner's switch, proposing a change, and every action with its decision. */
function MessagingSwitch({ data, handlers }: { data: HighLevelActionsData; handlers: HighLevelActionsHandlers }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const flip = async (on: boolean) => {
    setBusy(true);
    setProblem(await handlers.setMessaging(on, confirmed));
    setBusy(false);
  };
  return (
    <div className="grid gap-2 rounded-xl border border-border bg-background/60 p-4">
      <p className="text-sm font-medium text-card-foreground">Messaging leads</p>
      <p className="text-sm text-muted-foreground">
        Off by default. When on, Vistrial may text or email a lead, but only after an Owner approves that one message by typing SEND, and never if the lead opted out, it is 8 pm to 8 am their time, or Vistrial messaged them in the last day. Your business is responsible for having its leads&apos; consent (TCPA for texts, CAN-SPAM for email).
      </p>
      {data.messaging.enabled ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">On. Consent confirmed {data.messaging.consentAt ? when(data.messaging.consentAt) : ""}.</p>
          {data.can.toggle ? (
            <Button size="sm" variant="outline" onClick={() => void flip(false)} loading={busy}>
              Turn messaging off
            </Button>
          ) : null}
        </div>
      ) : data.can.toggle ? (
        <div className="grid gap-2">
          <label className="flex items-start gap-2 text-sm text-card-foreground">
            <input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            I confirm this business has its leads&apos; consent to be texted and emailed, and honours opt-outs.
          </label>
          <Button size="sm" className="w-fit" onClick={() => void flip(true)} loading={busy} disabled={!confirmed}>
            Turn messaging on
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Off. Only an Owner can turn it on.</p>
      )}
      {problem ? <Banner compact tone="warning" title={problem} /> : null}
    </div>
  );
}

export function HighLevelActionsView({ data, handlers }: { data: HighLevelActionsData; handlers: HighLevelActionsHandlers }) {
  const [switching, setSwitching] = useState(false);
  const waiting = data.actions.filter((row) => row.state === "proposed").length;
  if (!data.connected) return null;
  return (
    <Panel className="grid gap-4 p-4 sm:p-6" aria-label="Acting in HighLevel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 className="font-heading text-lg text-card-foreground">Acting in HighLevel</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Vistrial can move deals, tag leads, add notes and create tasks here, and text or email leads if an Owner turns messaging on. Each change waits until an Owner or Admin approves it; a deal&apos;s outcome and every message need an Owner. Vistrial never deletes anything in HighLevel.
          </p>
        </div>
        <StatusBadge
          label={data.organizationOff ? "Stopped for the organization" : data.enabled ? (waiting ? `${waiting} waiting` : "On, with approval") : "Off"}
          tone={data.organizationOff ? "warning" : data.enabled ? "good" : "neutral"}
          className="[&_span]:normal-case"
        />
      </div>

      {data.organizationOff ? <Banner compact tone="warning" title="An Owner stopped every CRM action for this organization. Nothing can be proposed or approved until it is allowed again." /> : null}
      {data.can.toggle ? (
        <Switch
          checked={!data.organizationOff}
          disabled={switching}
          onCheckedChange={async (next) => {
            setSwitching(true);
            await handlers.setOrganization(next);
            setSwitching(false);
          }}
          label="Allow CRM actions anywhere in this organization"
          description="Off stops every connection at once and cancels everything waiting."
        />
      ) : null}

      {data.can.toggle ? (
        <Switch
          checked={data.enabled}
          disabled={switching}
          onCheckedChange={async (next) => {
            setSwitching(true);
            await handlers.setActing(next);
            setSwitching(false);
          }}
          label="Let Vistrial act in this sub-account"
          description={data.enabled ? "Turning this off declines everything waiting, at once." : "Off by default. Only an Owner can turn it on."}
        />
      ) : !data.enabled ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden className="size-4" /> Off. Only an Owner can let Vistrial act here.
        </p>
      ) : null}

      {data.enabled && !data.organizationOff ? <MessagingSwitch data={data} handlers={handlers} /> : null}
      {data.enabled && !data.organizationOff && data.can.propose ? <ProposeForm data={data} onPropose={handlers.propose} /> : null}

      {data.actions.length > 0 ? (
        <section className="grid gap-2" aria-label="Actions">
          <h3 className="flex items-center gap-1.5 text-sm font-medium text-card-foreground">
            <Clock aria-hidden className="size-4 text-muted-foreground" /> Proposed and done
          </h3>
          <ul className={cn("grid gap-2")}>
            {data.actions.map((action) => (
              <ActionRow key={action.id} action={action} can={data.can} handlers={handlers} />
            ))}
          </ul>
        </section>
      ) : data.enabled ? (
        <p className="text-sm text-muted-foreground">Nothing proposed yet. Changes an agent or your team proposes appear here and in Approvals.</p>
      ) : null}
    </Panel>
  );
}
