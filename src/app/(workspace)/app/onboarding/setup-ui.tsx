"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";

import {
  askTeamForEmail,
  checkEmailDomain,
  confirmApproach,
  confirmReady,
  confirmSampleTest,
  decideImportProblemKind,
  markWelcomeSeen,
  requestApproachChange,
  requestCrmHelp,
  saveEscalationContacts,
  saveRegistration,
  sendContactTest,
  setChannel,
  setTeamStep,
  startImport,
  startSampleTest,
  type SetupResult,
} from "@/app/(workspace)/app/onboarding/setup-actions";
import { inviteMember, resendInvite, revokeInvite, setMemberApproval, type MemberActionResult } from "@/app/(workspace)/app/settings/members/actions";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Notice } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { plainRecordType, type DomainRecord, type RecordResult } from "@/lib/onboarding/email-domain";
import { PROBLEM_LABEL, type ProblemKind } from "@/lib/onboarding/import-plan";
import { BUSINESS_TYPES, REGISTRATION_FIELDS, REJECTION_GUIDANCE, type RejectionCode } from "@/lib/onboarding/registration";
import type { SampleStep } from "@/lib/onboarding/sample";
import { cardStack, errorClass, helperClass, insetSurface, successClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

/** The outcome line under an action: calm, in words, announced to screen readers. */
function Outcome({ result }: { result: SetupResult | null }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p role="alert" className={errorClass}>
        {result.error}
      </p>
    );
  }
  return result.message ? (
    <p role="status" className={successClass}>
      {result.message}
    </p>
  ) : null;
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SetupResult | null>(null);
  const run = (fn: () => Promise<SetupResult>, after?: (ok: boolean) => void) =>
    start(async () => {
      const outcome = await fn().catch(() => ({ ok: false as const, error: "Something went wrong. Your progress is saved; try again." }));
      setResult(outcome);
      after?.(outcome.ok);
      router.refresh();
    });
  return { pending, result, run, setResult };
}

/** Keeps a step fresh while something runs in the background. Stops on its own. */
export function AutoRefresh({ active, everyMs = 5000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => router.refresh(), everyMs);
    return () => window.clearInterval(id);
  }, [active, everyMs, router]);
  return null;
}

export function WelcomeContinue({ href }: { href: string }) {
  const router = useRouter();
  const { pending, result, run } = useAction();
  return (
    <div>
      <Button variant="primary" size="lg" loading={pending} onClick={() => run(markWelcomeSeen, (ok) => ok && router.push(href))}>
        Let&apos;s start
      </Button>
      <Outcome result={result} />
    </div>
  );
}

export function ApproachActions({ confirmed, nextHref }: { confirmed: boolean; nextHref: string }) {
  const router = useRouter();
  const { pending, result, run } = useAction();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  return (
    <div className={cardStack}>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={pending && !asking} onClick={() => run(confirmApproach, (ok) => ok && router.push(nextHref))}>
          {confirmed ? "Still looks right, continue" : "This looks right"}
        </Button>
        <Button variant="secondary" onClick={() => setAsking((open) => !open)} aria-expanded={asking}>
          Ask the team to adjust it
        </Button>
      </div>
      {asking ? (
        <div className={cardStack}>
          <Field label="What would you like to change?" name="approach_note" htmlFor="approach-note">
            <Textarea id="approach-note" rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div>
            <Button variant="secondary" loading={pending} onClick={() => run(() => requestApproachChange(note), (ok) => ok && setAsking(false))}>
              Send to your team
            </Button>
          </div>
        </div>
      ) : null}
      <Outcome result={result} />
    </div>
  );
}

export function CrmHelp() {
  const { pending, result, run } = useAction();
  const [name, setName] = useState("");
  return (
    <div className={cardStack}>
      <Field label="Which CRM do you use?" name="crm_name" htmlFor="crm-name" help="Your team will tell you what is possible and set it up with you.">
        <Input id="crm-name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </Field>
      <div>
        <Button variant="secondary" loading={pending} onClick={() => run(() => requestCrmHelp(name))}>
          Ask the team for help
        </Button>
      </div>
      <Outcome result={result} />
    </div>
  );
}

export function ChannelChoice({ channel, enabled }: { channel: "texting" | "email"; enabled: boolean }) {
  const { pending, result, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const noun = channel === "texting" ? "texting" : "email";
  if (!enabled) {
    return (
      <div className={cardStack}>
        <Notice tone="info" title={`Going live without ${noun}`}>
          <p className={helperClass}>You can switch it back on whenever you are ready.</p>
        </Notice>
        <div>
          <Button variant="secondary" loading={pending} onClick={() => run(() => setChannel(channel, true, ""))}>
            Use {noun} after all
          </Button>
        </div>
        <Outcome result={result} />
      </div>
    );
  }
  return (
    <div className={cardStack}>
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        We will not use {noun} for now
      </Button>
      {open ? (
        <div className={cardStack}>
          <Field label="Tell your team why" name={`${channel}_reason`} htmlFor={`${channel}-reason`}>
            <Input id={`${channel}-reason`} value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div>
            <Button variant="secondary" loading={pending} onClick={() => run(() => setChannel(channel, false, reason))}>
              Go live without {noun}
            </Button>
          </div>
        </div>
      ) : null}
      <Outcome result={result} />
    </div>
  );
}

/**
 * The registration details. Nothing saved is shown back (only staff can read
 * it); saved fields are marked, and the Owner fills in only what they need to
 * change. There is no tax ID field.
 */
export function RegistrationForm({ savedFields, rejection }: { savedFields: string[]; rejection: RejectionCode | null }) {
  const { pending, result, run } = useAction();
  const saved = new Set(savedFields);
  const fix = rejection ? new Set<string>(REJECTION_GUIDANCE[rejection].fields) : null;
  const fieldErrors = result && !result.ok ? (result.fields ?? {}) : {};
  return (
    <form
      className={cardStack}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const input: Record<string, string> = {};
        for (const field of REGISTRATION_FIELDS) {
          const value = String(data.get(field.key) ?? "").trim();
          if (value) input[field.key] = value;
        }
        run(() => saveRegistration(input), (ok) => ok && event.currentTarget?.reset());
      }}
    >
      <Notice tone="info" title="Your tax ID">
        <p className={helperClass}>Your team will ask you for your tax ID directly. You do not need to enter it here.</p>
      </Notice>
      {saved.size ? (
        <p className={helperClass}>
          Fields marked Saved are already stored securely. Leave them empty to keep them, or type a new value to change them.
        </p>
      ) : null}
      {REGISTRATION_FIELDS.map((field) => {
        const isSaved = saved.has(field.key);
        const needsFix = fix?.has(field.key) ?? false;
        const id = `reg-${field.key}`;
        const aside = needsFix ? (
          <StatusBadge label="Check this" tone="critical" />
        ) : isSaved ? (
          <StatusBadge label="Saved" tone="good" />
        ) : null;
        return (
          <Field
            key={field.key}
            label={field.label}
            name={field.key}
            htmlFor={id}
            help={"help" in field ? field.help : undefined}
            required={field.required && !isSaved}
            error={fieldErrors[field.key] ?? null}
            labelAside={aside}
          >
            {"kind" in field && field.kind === "choice" ? (
              <Select id={id} name={field.key} defaultValue="" placeholder={isSaved ? "Keep what is saved" : "Choose one"}>
                <option value="">{isSaved ? "Keep what is saved" : "Choose one"}</option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            ) : "kind" in field && field.kind === "long" ? (
              <Textarea id={id} name={field.key} rows={3} maxLength={field.max} />
            ) : (
              <Input
                id={id}
                name={field.key}
                maxLength={field.max}
                type={"kind" in field && field.kind === "email" ? "email" : "kind" in field && field.kind === "phone" ? "tel" : "text"}
                inputMode={"kind" in field && field.kind === "url" ? "url" : undefined}
              />
            )}
          </Field>
        );
      })}
      <div>
        <Button type="submit" variant="primary" loading={pending}>
          Save securely
        </Button>
      </div>
      <Outcome result={result} />
    </form>
  );
}

export function EmailRecords({
  domain,
  records,
  lastResult,
  verified,
  teamAsked,
}: {
  domain: string | null;
  records: DomainRecord[];
  lastResult: RecordResult[];
  verified: boolean;
  teamAsked: boolean;
}) {
  const { pending, result, run } = useAction();
  const found = new Map(lastResult.map((row) => [`${row.type}:${row.host}`, row.found]));
  return (
    <div className={cardStack}>
      {records.length ? (
        <ol className="space-y-4">
          {records.map((record, index) => {
            const state = found.get(`${record.type}:${record.host}`);
            return (
              <li key={`${record.type}-${record.host}-${index}`} className={insetSurface}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-white">
                    {index + 1}. {plainRecordType(record.type)}
                    {record.purpose ? <span className={cn(helperClass, "ml-2 inline")}>{record.purpose}</span> : null}
                  </p>
                  {state === undefined ? null : <StatusBadge label={state ? "Found" : "Not found yet"} tone={state ? "good" : "warning"} />}
                </div>
                <div className="mt-3 grid gap-3">
                  <CopyField label="Name (sometimes called Host)" value={record.host} />
                  <CopyField label="Value" value={record.value} />
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p className={helperClass}>
        {domain ? `Add these where ${domain} is managed (often where you bought the domain). ` : ""}
        New records can take a few hours to show up.
      </p>
      <div className="flex flex-wrap gap-2">
        {records.length && !verified ? (
          <Button variant="primary" loading={pending} onClick={() => run(checkEmailDomain)}>
            Check again
          </Button>
        ) : null}
        {!verified && !teamAsked ? (
          <Button variant="secondary" loading={pending} onClick={() => run(askTeamForEmail)}>
            Ask the team to do this for me
          </Button>
        ) : null}
      </div>
      <Outcome result={result} />
    </div>
  );
}

export function ApproverList({
  people,
}: {
  people: Array<{ id: string; name: string; role: string; canApprove: boolean; signedIn: boolean }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={cardStack}>
      <ul className="space-y-3">
        {people.map((person) => (
          <li key={person.id} className={cn(insetSurface, "flex flex-wrap items-center justify-between gap-3")}>
            <div className="min-w-0">
              <p className="truncate text-sm text-white">{person.name}</p>
              <p className={helperClass}>
                {person.role === "owner" ? "Owner. Always approves." : "Member"}
                {person.signedIn ? "" : " · Has not signed in yet"}
              </p>
            </div>
            {person.role === "member" ? (
              <Switch
                aria-label={`${person.name} approves messages`}
                checked={person.canApprove}
                disabled={pending}
                onCheckedChange={(next) =>
                  start(async () => {
                    const outcome: MemberActionResult = await setMemberApproval(person.id, next);
                    setError(outcome.ok ? null : outcome.error);
                    router.refresh();
                  })
                }
              />
            ) : (
              <StatusBadge label="Approves" tone="good" />
            )}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Candidate = { key: string; memberId?: string; inviteId?: string; name: string; hasPhone: boolean; pending: boolean };
type ContactRow = { id: string; key: string; name: string; channel: "push" | "email" | "sms"; verified: boolean; testSent: boolean; pending: boolean };

const CHANNEL_WORDS: Record<ContactRow["channel"], string> = { push: "In the app", email: "Email", sms: "Text message" };

/** An ordered list of named people, each with how they hear. */
export function EscalationEditor({ candidates, contacts }: { candidates: Candidate[]; contacts: ContactRow[] }) {
  const { pending, result, run } = useAction();
  const [rows, setRows] = useState(contacts.map((row) => ({ key: row.key, channel: row.channel })));
  const [adding, setAdding] = useState("");
  const byKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const saved = new Map(contacts.map((row) => [row.key, row]));
  const dirty = JSON.stringify(rows) !== JSON.stringify(contacts.map((row) => ({ key: row.key, channel: row.channel })));
  const move = (index: number, by: number) =>
    setRows((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item!);
      return next;
    });

  return (
    <div className={cardStack}>
      {rows.length ? (
        <ol className="space-y-3">
          {rows.map((row, index) => {
            const who = byKey.get(row.key);
            const contact = saved.get(row.key);
            return (
              <li key={row.key} className={cn(insetSurface, "space-y-3")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm text-white">
                    {index + 1}. {who?.name ?? contact?.name ?? "Someone"}
                  </p>
                  {contact?.verified && contact.channel === row.channel ? (
                    <StatusBadge label="Confirmed" tone="good" />
                  ) : contact?.testSent && contact.channel === row.channel ? (
                    <StatusBadge label="Test sent" tone="warning" />
                  ) : who?.pending ? (
                    <StatusBadge label="Invitation waiting" tone="neutral" />
                  ) : null}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="How they hear" name={`channel-${row.key}`} htmlFor={`channel-${row.key}`} className="min-w-40 flex-1">
                    <Select
                      id={`channel-${row.key}`}
                      value={row.channel}
                      onChange={(event) =>
                        setRows((current) => current.map((item) => (item.key === row.key ? { ...item, channel: event.target.value as ContactRow["channel"] } : item)))
                      }
                    >
                      <option value="push">{CHANNEL_WORDS.push}</option>
                      <option value="email">{CHANNEL_WORDS.email}</option>
                      {who?.hasPhone ? <option value="sms">{CHANNEL_WORDS.sms}</option> : null}
                    </Select>
                  </Field>
                  <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${who?.name ?? "contact"} up`}>
                    Up
                  </Button>
                  <Button variant="ghost" size="sm" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${who?.name ?? "contact"} down`}>
                    Down
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}>
                    Remove
                  </Button>
                  {contact && !dirty && !contact.verified && !who?.pending ? (
                    <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => sendContactTest(contact.id))}>
                      Send a test
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={helperClass}>Nobody yet. Add yourself to start.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Add someone" name="add_contact" htmlFor="add-contact" className="min-w-48 flex-1">
          <Select id="add-contact" value={adding} onChange={(event) => setAdding(event.target.value)}>
            <option value="">Choose a person</option>
            {candidates
              .filter((candidate) => !rows.some((row) => row.key === candidate.key))
              .map((candidate) => (
                <option key={candidate.key} value={candidate.key}>
                  {candidate.name}
                  {candidate.pending ? " (invited)" : ""}
                </option>
              ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          disabled={!adding}
          onClick={() => {
            setRows((current) => [...current, { key: adding, channel: "push" }]);
            setAdding("");
          }}
        >
          Add
        </Button>
      </div>
      <div>
        <Button
          variant="primary"
          loading={pending}
          disabled={!dirty}
          onClick={() =>
            run(() =>
              saveEscalationContacts(
                rows.map((row) => {
                  const who = byKey.get(row.key);
                  return who?.memberId ? { member_id: who.memberId, channel: row.channel } : { invite_id: who?.inviteId, channel: row.channel };
                })
              )
            )
          }
        >
          Save the list
        </Button>
      </div>
      <Outcome result={result} />
    </div>
  );
}

const ROLE_HELP: Record<string, string> = {
  member: "Sees results and what Vistrial has done. Can approve messages if you allow it.",
  operator: "A setter, closer, or assistant. Works the leads assigned to them.",
};

export function InviteTeam({
  pending: invites,
  canInvite,
}: {
  pending: Array<{ id: string; email: string; role: string }>;
  canInvite: boolean;
}) {
  const router = useRouter();
  const [state, action, submitting] = useActionState<MemberActionResult, FormData>(inviteMember, { ok: true });
  const [busy, start] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);
  useEffect(() => {
    if (state.ok && state.url) router.refresh();
  }, [state, router]);
  return (
    <div className={cardStack}>
      {canInvite ? (
        <form action={action} className={cardStack}>
          <Field label="Email" name="email" htmlFor="invite-email">
            <Input id="invite-email" name="email" type="email" required autoComplete="off" />
          </Field>
          <Field label="What they do" name="role" htmlFor="invite-role" help={ROLE_HELP.operator}>
            <Select id="invite-role" name="role" defaultValue="operator">
              <option value="operator">Works leads (setter, closer, or assistant)</option>
              <option value="member">Sees results (manager or partner)</option>
            </Select>
          </Field>
          <div>
            <Button type="submit" variant="primary" loading={submitting}>
              Send the invitation
            </Button>
          </div>
          {!state.ok ? (
            <p role="alert" className={errorClass}>
              {state.error}
            </p>
          ) : state.url ? (
            <p role="status" className={successClass}>
              {state.emailed ? "Invitation sent." : "Invitation created. The email did not send; copy the link from People in Settings."}
            </p>
          ) : null}
        </form>
      ) : null}
      {invites.length ? (
        <div>
          <p className="text-sm text-white">Waiting to accept</p>
          <ul className="mt-2 space-y-2">
            {invites.map((invite) => (
              <li key={invite.id} className={cn(insetSurface, "flex flex-wrap items-center justify-between gap-2")}>
                <span className="min-w-0 break-all text-sm text-white">
                  {invite.email} <span className={cn(helperClass, "inline")}>· {invite.role === "member" ? "Sees results" : "Works leads"}</span>
                </span>
                {canInvite ? (
                  <span className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busy}
                      onClick={() =>
                        start(async () => {
                          const outcome = await resendInvite(invite.id);
                          setRowError(outcome.ok ? null : outcome.error);
                          router.refresh();
                        })
                      }
                    >
                      Resend
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busy}
                      onClick={() =>
                        start(async () => {
                          const outcome = await revokeInvite(invite.id);
                          setRowError(outcome.ok ? null : outcome.error);
                          router.refresh();
                        })
                      }
                    >
                      Cancel
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {rowError ? (
            <p role="alert" className={errorClass}>
              {rowError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TeamStepButtons({ nextHref }: { nextHref: string }) {
  const router = useRouter();
  const { pending, result, run } = useAction();
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={pending} onClick={() => run(() => setTeamStep("done"), (ok) => ok && router.push(nextHref))}>
          I have invited everyone
        </Button>
        <Button variant="secondary" loading={pending} onClick={() => run(() => setTeamStep("later"), (ok) => ok && router.push(nextHref))}>
          I will do this later
        </Button>
      </div>
      <Outcome result={result} />
    </div>
  );
}

export function ImportStart({ defaultDays, maxDays, aiActiveDays }: { defaultDays: number; maxDays: number; aiActiveDays: number }) {
  const { pending, result, run } = useAction();
  const [days, setDays] = useState(defaultDays);
  const choices = [...new Set([30, 60, defaultDays, 90, 180, maxDays].filter((value) => value <= maxDays))].sort((a, b) => a - b);
  return (
    <div className={cardStack}>
      <Field label="How far back?" name="lookback" htmlFor="lookback" help={`Leads added to your CRM in this time come in. Leads active in the last ${aiActiveDays} days get a full case file from Scribe.`}>
        <Select id="lookback" value={String(days)} onChange={(event) => setDays(Number(event.target.value))}>
          {choices.map((value) => (
            <option key={value} value={value}>
              The last {value} days{value === defaultDays ? " (suggested)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      {days > defaultDays ? (
        <Notice tone="info">
          <p className={helperClass}>Older leads come in with basic case files only, built from what your CRM knows about them.</p>
        </Notice>
      ) : null}
      <div>
        <Button variant="primary" loading={pending} onClick={() => run(() => startImport(days))}>
          Bring in my leads
        </Button>
      </div>
      <Outcome result={result} />
    </div>
  );
}

export function ImportProblems({ problems }: { problems: Partial<Record<ProblemKind, number>> }) {
  const { pending, result, run } = useAction();
  const kinds = (Object.entries(problems) as Array<[ProblemKind, number]>).filter(([, count]) => count > 0);
  if (!kinds.length) return null;
  return (
    <div className={cardStack}>
      <p className="text-sm text-white">A few things to decide</p>
      <ul className="space-y-3">
        {kinds.map(([kind, count]) => (
          <li key={kind} className={insetSurface}>
            <p className="text-sm text-white">
              {count} {count === 1 ? PROBLEM_LABEL[kind].one : PROBLEM_LABEL[kind].many}.
            </p>
            <p className={helperClass}>{PROBLEM_LABEL[kind].choice}</p>
            {kind !== "could_not_read" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => decideImportProblemKind(kind, "keep"))}>
                  Keep them
                </Button>
                <Button variant="ghost" size="sm" loading={pending} onClick={() => run(() => decideImportProblemKind(kind, "skip"))}>
                  Leave them out
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Outcome result={result} />
    </div>
  );
}

export function SampleStart({ again }: { again: boolean }) {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Button variant="primary" size="lg" loading={pending} onClick={() => run(startSampleTest)}>
        {again ? "Run the test again" : "Start the test"}
      </Button>
      <Outcome result={result} />
    </div>
  );
}

const STEP_TONE: Record<SampleStep["status"], { label: string; tone: "good" | "warning" | "neutral" | "critical" }> = {
  done: { label: "Done", tone: "good" },
  working: { label: "Working", tone: "warning" },
  waiting: { label: "Waiting", tone: "neutral" },
  failed: { label: "Stopped", tone: "critical" },
};

export function SampleSteps({ steps }: { steps: SampleStep[] }) {
  return (
    <ol className="space-y-3" aria-live="polite">
      {steps.map((step, index) => (
        <li key={step.key} className={insetSurface}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-white">
              {index + 1}. {step.label}
            </p>
            <StatusBadge label={STEP_TONE[step.status].label} tone={STEP_TONE[step.status].tone} />
          </div>
          {step.detail ? <p className={helperClass}>{step.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function SampleConfirm({ runId }: { runId: string }) {
  const { pending, result, run } = useAction();
  const [reporting, setReporting] = useState(false);
  const [what, setWhat] = useState("");
  return (
    <div className={cardStack}>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={pending && !reporting} onClick={() => run(() => confirmSampleTest(runId, true, ""))}>
          It worked
        </Button>
        <Button variant="secondary" onClick={() => setReporting((open) => !open)} aria-expanded={reporting}>
          Something looked wrong
        </Button>
      </div>
      {reporting ? (
        <div className={cardStack}>
          <Field label="What looked wrong?" name="sample_problem" htmlFor="sample-problem">
            <Textarea id="sample-problem" rows={3} maxLength={3500} value={what} onChange={(event) => setWhat(event.target.value)} />
          </Field>
          <div>
            <Button variant="secondary" loading={pending} onClick={() => run(() => confirmSampleTest(runId, false, what))}>
              Send to your team
            </Button>
          </div>
        </div>
      ) : null}
      <Outcome result={result} />
    </div>
  );
}

export function ConfirmReady() {
  const { pending, result, run } = useAction();
  return (
    <div>
      <Button variant="primary" size="lg" loading={pending} onClick={() => run(confirmReady)}>
        I am ready to go live
      </Button>
      <Outcome result={result} />
    </div>
  );
}

export function NextLink({ href, label = "Continue" }: { href: string; label?: string }) {
  return (
    <Button variant="primary" render={<Link href={href} />}>
      {label}
    </Button>
  );
}
