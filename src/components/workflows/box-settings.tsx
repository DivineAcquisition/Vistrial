"use client";

import { CircleAlertIcon, InfoIcon, LockIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedRadioGroup } from "@/components/ui/segmented-radio";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BOX_ICONS } from "@/components/workflows/box-icons";
import { QUIET_HOURS_NOTE } from "@/lib/workflows/checker";
import { describeBox, kindLabel } from "@/lib/workflows/describe";
import type { EditorContext } from "@/lib/workflows/editor-context";
import { BOOKING_EVENTS, CHECK_KINDS, END_REASONS, ENTRY_TRIGGERS, TIERS, type Box, type BoxConfig, type CheckIssue } from "@/lib/workflows/types";
import { captionText, labelClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

const TRIGGER_WORDS: Record<(typeof ENTRY_TRIGGERS)[number], string> = {
  new_lead: "A new lead arrives",
  stage_changed: "A lead moves to a stage",
  no_activity: "A lead has no activity for some days",
  booking: "A booking changes",
  tier_changed: "A lead's tier changes",
  manual: "A person starts it by hand",
};

const BOOKING_WORDS: Record<(typeof BOOKING_EVENTS)[number], string> = {
  made: "Made",
  rescheduled: "Rescheduled",
  canceled: "Canceled",
  missed: "Missed (no-show)",
};

const CHECK_WORDS: Record<(typeof CHECK_KINDS)[number], string> = {
  replied_since: "Has the lead replied?",
  booking_state: "Is there a booking?",
  stage_is: "Is the lead in a stage?",
  tier_at_least: "Is the tier at least?",
  field_is: "Does a field match?",
  has_owner: "Does the lead have an owner?",
  human_touched_recently: "Has a person touched the lead recently?",
};

const END_WORDS: Record<(typeof END_REASONS)[number], string> = {
  won: "Won",
  lost: "Lost",
  booked: "Booked and handed on",
  replied: "Replied and handed to a person",
  stopped: "Stopped",
};

const TIER_WORDS: Record<(typeof TIERS)[number], string> = { cold: "Cold", warm: "Warm", hot: "Hot" };

function Row({ label, help, children }: { label: string; help?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children(id)}
      {help ? <p className={cn(captionText, "mt-1.5")}>{help}</p> : null}
    </div>
  );
}

function numberOr(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Plain-language settings for one box, a line saying exactly what will happen,
 * and the checker's messages for it. Quiet hours are shown, never editable.
 */
export function BoxSettings({
  box,
  ctx,
  issues,
  preview,
  readOnly = false,
  onChange,
}: {
  box: Box;
  ctx: EditorContext;
  issues: CheckIssue[];
  preview: string | null;
  readOnly?: boolean;
  onChange: (config: BoxConfig) => void;
}) {
  const c = box.config;
  const Icon = BOX_ICONS[c.kind];
  const { title } = describeBox(box);
  const errors = [...new Set(issues.filter((issue) => issue.severity === "error").map((issue) => issue.message))];
  const notes = [...new Set(issues.filter((issue) => issue.severity === "warning" && issue.code !== "quiet_hours").map((issue) => issue.message))];
  const set = (patch: Partial<BoxConfig>) => onChange({ ...c, ...patch } as BoxConfig);
  const stageOptions = [{ value: "", label: "Choose a stage" }, ...ctx.stages.map((stage) => ({ value: stage, label: stage }))];

  return (
    <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-overlay/6 text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{kindLabel(c.kind)}</p>
          <legend className="text-base font-medium text-card-foreground">{title}</legend>
        </div>
      </div>

      {errors.length > 0 ? (
        <ul className="space-y-1.5 rounded-xl border border-destructive/30 bg-destructive/6 p-3" aria-label="Fix before publishing">
          {errors.map((message) => (
            <li key={message} className="flex gap-2 text-sm text-destructive-foreground">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {message}
            </li>
          ))}
        </ul>
      ) : null}

      {c.kind === "start" ? (
        <>
          <Row label="What starts it">
            {(id) => (
              <Select
                id={id}
                value={c.trigger}
                options={ENTRY_TRIGGERS.map((value) => ({ value, label: TRIGGER_WORDS[value] }))}
                onChange={(event) => set({ trigger: event.target.value as typeof c.trigger })}
              />
            )}
          </Row>
          {c.trigger === "stage_changed" ? (
            <Row label="Stage" help={ctx.stages.length === 0 ? "No stages are mapped from your CRM yet." : undefined}>
              {(id) => <Select id={id} value={c.stage ?? ""} options={stageOptions} onChange={(event) => set({ stage: event.target.value || undefined })} />}
            </Row>
          ) : null}
          {c.trigger === "no_activity" ? (
            <Row label="Days with no activity">
              {(id) => <Input id={id} type="number" min={1} max={365} value={c.days ?? ""} onChange={(event) => set({ days: numberOr(event.target.value, 0) })} />}
            </Row>
          ) : null}
          {c.trigger === "booking" ? (
            <Row label="Booking event">
              {(id) => (
                <Select
                  id={id}
                  value={c.bookingEvent ?? ""}
                  options={[{ value: "", label: "Choose an event" }, ...BOOKING_EVENTS.map((value) => ({ value, label: BOOKING_WORDS[value] }))]}
                  onChange={(event) => set({ bookingEvent: (event.target.value || undefined) as typeof c.bookingEvent })}
                />
              )}
            </Row>
          ) : null}
          {c.trigger === "tier_changed" ? (
            <Row label="Becomes">
              {(id) => (
                <Select
                  id={id}
                  value={c.tier ?? ""}
                  options={[{ value: "", label: "Choose a tier" }, ...TIERS.map((value) => ({ value, label: TIER_WORDS[value] }))]}
                  onChange={(event) => set({ tier: (event.target.value || undefined) as typeof c.tier })}
                />
              )}
            </Row>
          ) : null}
          <p className={captionText}>
            Only leads that match after you publish, and after the connection went live, enter. Opted out and do-not-contact leads never enter.
          </p>
        </>
      ) : null}

      {c.kind === "wait" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Row label="Wait">
              {(id) => <Input id={id} type="number" min={1} value={c.amount} onChange={(event) => set({ amount: numberOr(event.target.value, 1) })} />}
            </Row>
            <Row label="Unit">
              {(id) => (
                <Select
                  id={id}
                  value={c.unit}
                  options={[
                    { value: "hours", label: "Hours" },
                    { value: "days", label: "Days" },
                  ]}
                  onChange={(event) => set({ unit: event.target.value as "hours" | "days" })}
                />
              )}
            </Row>
          </div>
          <Row label="Then wait until (optional)" help="A time of day in the lead's own time zone, like 09:00.">
            {(id) => <Input id={id} type="time" value={c.atTime ?? ""} onChange={(event) => set({ atTime: event.target.value || undefined })} />}
          </Row>
        </>
      ) : null}

      {c.kind === "check" ? (
        <>
          <Row label="Question">
            {(id) => (
              <Select
                id={id}
                value={c.check}
                options={CHECK_KINDS.map((value) => ({ value, label: CHECK_WORDS[value] }))}
                onChange={(event) => set({ check: event.target.value as typeof c.check, value: undefined })}
              />
            )}
          </Row>
          {c.check === "stage_is" ? (
            <Row label="Stage">{(id) => <Select id={id} value={c.value ?? ""} options={stageOptions} onChange={(event) => set({ value: event.target.value || undefined })} />}</Row>
          ) : null}
          {c.check === "tier_at_least" ? (
            <Row label="Tier">
              {(id) => (
                <Select
                  id={id}
                  value={c.value ?? ""}
                  options={[{ value: "", label: "Choose a tier" }, ...TIERS.map((value) => ({ value, label: TIER_WORDS[value] }))]}
                  onChange={(event) => set({ value: event.target.value || undefined })}
                />
              )}
            </Row>
          ) : null}
          {c.check === "booking_state" ? (
            <Row label="Booking is">
              {(id) => (
                <Select
                  id={id}
                  value={c.value ?? ""}
                  options={[
                    { value: "", label: "Choose a state" },
                    { value: "in_place", label: "In place" },
                    { value: "completed", label: "Completed" },
                    { value: "missed", label: "Missed" },
                  ]}
                  onChange={(event) => set({ value: event.target.value || undefined })}
                />
              )}
            </Row>
          ) : null}
          {c.check === "field_is" ? (
            <Row label="Field and value" help="Approved fields only, written as field=value. For example source=Website.">
              {(id) => <Input id={id} value={c.value ?? ""} onChange={(event) => set({ value: event.target.value || undefined })} />}
            </Row>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Row label="Yes means">{(id) => <Input id={id} value={c.yesLabel} maxLength={60} onChange={(event) => set({ yesLabel: event.target.value })} />}</Row>
            <Row label="No means">{(id) => <Input id={id} value={c.noLabel} maxLength={60} onChange={(event) => set({ noLabel: event.target.value })} />}</Row>
          </div>
          {c.check === "replied_since" ? <p className={captionText}>Reads reply activity only, never the words of a message.</p> : null}
        </>
      ) : null}

      {c.kind === "draft" ? (
        <>
          <div className="flex flex-col gap-2">
            <span className={labelClass}>Channel</span>
            <SegmentedRadioGroup
              aria-label="Channel"
              value={c.channel ?? ""}
              options={[
                { value: "text", label: "Text" },
                { value: "email", label: "Email" },
              ]}
              onValueChange={(value) => set({ channel: value as "text" | "email" })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className={labelClass}>Write it from</span>
            <SegmentedRadioGroup
              aria-label="Write it from"
              value={c.contentKind}
              options={[
                { value: "talk_track", label: "Talk track" },
                { value: "snippet", label: "Snippet" },
              ]}
              onValueChange={(value) => set({ contentKind: value as "snippet" | "talk_track", contentRef: null })}
            />
          </div>
          <Row
            label={c.contentKind === "talk_track" ? "Talk track" : "Snippet"}
            help={(c.contentKind === "talk_track" ? ctx.talkTracks : ctx.snippets).length === 0 ? "None yet. They come from your playbook." : undefined}
          >
            {(id) => (
              <Select
                id={id}
                value={c.contentRef ?? ""}
                options={[
                  { value: "", label: "Choose one" },
                  ...(c.contentKind === "talk_track" ? ctx.talkTracks : ctx.snippets).map((item) => ({ value: item.id, label: item.name })),
                ]}
                onChange={(event) => set({ contentRef: event.target.value || null })}
              />
            )}
          </Row>
          <Row label="Hours to approve it" help="If nobody approves it in time, it expires, nothing is sent, and the lead takes the Expired line.">
            {(id) => <Input id={id} type="number" min={1} max={168} value={c.windowHours} onChange={(event) => set({ windowHours: numberOr(event.target.value, 24) })} />}
          </Row>
          <div className="space-y-2 rounded-xl border bg-muted p-3 text-sm">
            <p className="flex gap-2 text-card-foreground">
              <LockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              {QUIET_HOURS_NOTE}
            </p>
            <p className="pl-6 text-xs text-muted-foreground">
              Before it sends, Vistrial checks again: consent, opt-outs, quiet hours, how often this lead has heard from you, the sender, and billing.
            </p>
          </div>
        </>
      ) : null}

      {c.kind === "task" ? (
        <>
          <Row label="What the task says">{(id) => <Textarea id={id} value={c.text} maxLength={300} onChange={(event) => set({ text: event.target.value })} />}</Row>
          <Row label="Due in (hours)">{(id) => <Input id={id} type="number" min={1} value={c.dueHours} onChange={(event) => set({ dueHours: numberOr(event.target.value, 4) })} />}</Row>
          <Row label="Who it goes to">
            {(id) => (
              <Select
                id={id}
                value={c.assignee.kind === "lead_owner" ? "lead_owner" : c.assignee.kind === "role" ? `role:${c.assignee.role}` : `person:${c.assignee.memberId}`}
                options={[
                  { value: "lead_owner", label: "The lead's owner" },
                  ...ctx.roles.map((role) => ({ value: `role:${role}`, label: `Anyone with the ${role} role` })),
                  ...ctx.members.map((member) => ({ value: `person:${member.id}`, label: member.name })),
                ]}
                onChange={(event) => {
                  const value = event.target.value;
                  set({
                    assignee:
                      value === "lead_owner"
                        ? { kind: "lead_owner" }
                        : value.startsWith("role:")
                          ? { kind: "role", role: value.slice(5) }
                          : { kind: "person", memberId: value.slice(7) },
                  });
                }}
              />
            )}
          </Row>
          <Switch label="Also send an alert" checked={c.alert} onCheckedChange={(checked) => set({ alert: checked })} />
        </>
      ) : null}

      {c.kind === "route" ? (
        <>
          <Row label="What it does">
            {(id) => (
              <Select
                id={id}
                value={c.mode}
                options={[
                  { value: "assign_unowned", label: "Assign an owner when there is none" },
                  { value: "reassign", label: "Ask to reassign an owned lead" },
                ]}
                onChange={(event) => set({ mode: event.target.value as typeof c.mode })}
              />
            )}
          </Row>
          <p className={captionText}>
            {c.mode === "reassign"
              ? "Reassigning never happens silently. The owner gets a task to confirm, unless your workspace allows automatic reassignment."
              : "Uses the same routing rules as the rest of Vistrial. Every route is logged on the lead."}
          </p>
        </>
      ) : null}

      {c.kind === "end" ? (
        <Row label="Why the lead leaves">
          {(id) => (
            <Select
              id={id}
              value={c.reason}
              options={END_REASONS.map((value) => ({ value, label: END_WORDS[value] }))}
              onChange={(event) => set({ reason: event.target.value as typeof c.reason })}
            />
          )}
        </Row>
      ) : null}

      {c.kind === "note" ? (
        <Row label="Note" help="A label for the picture. It does nothing.">
          {(id) => <Textarea id={id} value={c.text} maxLength={500} onChange={(event) => set({ text: event.target.value })} />}
        </Row>
      ) : null}

      {preview ? (
        <p className="flex gap-2 rounded-xl border border-brand-500/25 bg-brand-500/6 p-3 text-sm text-card-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-brand-300" aria-hidden />
          <span>{preview}</span>
        </p>
      ) : null}

      {notes.length > 0 ? (
        <ul className={cn(captionText, "space-y-1")} aria-label="Things to know">
          {notes.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
