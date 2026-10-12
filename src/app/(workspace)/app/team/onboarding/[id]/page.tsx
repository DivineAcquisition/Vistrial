import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  AcceptWarning,
  ActivateNext,
  ActivationPause,
  ApproveGoLive,
  CaseFilePace,
  CheckinForm,
  EmailRecordsEditor,
  ImportControls,
  MoveBack,
  OwnerInviteControls,
  ProblemDecision,
  RegistrationStatusForm,
  ReviewSignoff,
  SampleControls,
  SentryAlertsOn,
  StaffDetailsForm,
  StageControls,
} from "@/app/(workspace)/app/team/onboarding/staff-ui";
import { PageFrame } from "@/components/app/page-frame";
import { DefinitionList, KeyValue } from "@/components/ui/definition-list";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { Notice } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { AGENTS } from "@/lib/agents/roster";
import { requireStaff } from "@/lib/auth/gates";
import { listPlanPrices } from "@/lib/billing/stripe";
import { formatDay, formatRelative } from "@/lib/format";
import { ACTIVATION_STAGE_LABEL, activationStepCopy, nextActivationStep } from "@/lib/onboarding/activation";
import { PROBLEM_LABEL, SKIP_REASON_LABEL } from "@/lib/onboarding/import-plan";
import { loadWorkbench, type GoLiveCheck, type Workbench } from "@/lib/onboarding/load";
import { QUEUE_RISK_LABEL, queueRisk } from "@/lib/onboarding/queue";
import { CARRIER_STATUS_LABEL, REGISTRATION_FIELDS, REJECTION_GUIDANCE } from "@/lib/onboarding/registration";
import { PHASE_LABEL, STAGE_STATUS_LABEL, WAITING_ON_LABEL, type WaitingOn, waitingText } from "@/lib/onboarding/stages";
import { cardTitle, helperClass } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Onboarding workbench" };

const CHECK_TONE = { pass: "good", warning: "warning", fail: "critical" } as const;
const CHECK_WORD = { pass: "Passes", warning: "Warning", fail: "Fails" } as const;

type Params = Promise<{ id: string }>;

/**
 * One workspace's setup, for the team: every stage, the go-live checks,
 * staged activation, and the work only staff do. A workspace outside the
 * person's access reads as not found.
 */
export default async function OnboardingWorkbenchPage({ params }: { params: Params }) {
  const ctx = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const wb = await loadWorkbench(id);
  if (!wb) notFound();

  const plans = ctx.isPlatformAdmin ? await listPlanPrices().catch(() => [] as Array<{ id: string; label: string }>) : [];
  const nowIso = new Date().toISOString();
  const now = Date.parse(nowIso);
  const h = wb.header;
  const phase = PHASE_LABEL[h.phase];
  const waitingOn = (String(h.waiting_on ?? "nobody") as WaitingOn) ?? "nobody";
  const risk = QUEUE_RISK_LABEL[
    queueRisk({ stuck: h.stuck === true, phase: h.phase, waiting_on: waitingOn, waiting_since: str(h.waiting_since) }, now)
  ];
  const orgId = wb.org.id;
  const enter = (path: string) => `/app/team/enter?org=${orgId}&next=${encodeURIComponent(path)}`;
  const fixHref = (check: GoLiveCheck) => (check.fix_href.startsWith("/app/team/") ? check.fix_href : enter(check.fix_href));
  const failing = wb.header.checks.filter((check) => check.result === "fail" || (check.result === "warning" && !check.accepted));
  const watchDays = wb.templateDefaults?.sentry_watch_days ?? 1;
  const next = nextActivationStep(wb.activation);
  const sentryRow = wb.activation.find((row) => row.agent === "sentry");
  const watchUntil = str(h.sentry_watch_until);
  const preLive = h.phase === "setup" || h.phase === "ready_for_review";
  const hasOwner = wb.people.some((person) => person.role === "owner");
  const staff = (wb.staff ?? {}) as Record<string, unknown>;

  return (
    <PageFrame
      eyebrow="Onboarding"
      title={wb.org.name}
      description={`${wb.org.slug} · created ${formatDay(wb.org.created_at)} · ${wb.org.timezone}`}
      status={phase.label}
      statusTone={phase.tone}
      secondaryActions={
        <span className="flex flex-wrap items-center gap-3">
          <Link href={enter("/app/onboarding")} className="text-sm text-brand-300 underline underline-offset-2">
            See it as the customer does
          </Link>
          <Link href={`/app/team/workspaces/${orgId}`} className="text-sm text-muted-foreground underline underline-offset-2">
            Workspace overview
          </Link>
          <Link href="/app/team/onboarding" className="text-sm text-muted-foreground underline underline-offset-2">
            All onboarding
          </Link>
        </span>
      }
    >
      {h.stuck ? (
        <Notice tone="critical" title="Stuck">
          <p className={helperClass}>{str(h.stuck_reason) ?? "Nothing has moved for a while."}</p>
        </Notice>
      ) : null}
      {h.phase === "paused" || h.phase === "cancelled" ? (
        <Notice tone="warning" title={h.phase === "paused" ? "Paused" : "Cancelled"}>
          <p className={helperClass}>{str(h.paused_reason) ?? "No reason recorded."} Every agent is off.</p>
        </Notice>
      ) : null}

      <Panel className="p-6">
        <h2 className={cardTitle}>Where it stands</h2>
        <DefinitionList>
          <KeyValue label="Risk">
            <StatusBadge label={risk.label} tone={risk.tone} />
          </KeyValue>
          <KeyValue label="Waiting on">
            {WAITING_ON_LABEL[waitingOn]}
            {waitingOn !== "nobody" && str(h.waiting_since) ? ` (${waitingText(str(h.waiting_since), now)})` : ""}
          </KeyValue>
          <KeyValue label="Owner said ready">{str(h.owner_confirmed_at) ? formatRelative(String(h.owner_confirmed_at), nowIso) : "Not yet"}</KeyValue>
          <KeyValue label="Go-live approved">
            {str(h.go_live_approved_at) ? `${formatRelative(String(h.go_live_approved_at), nowIso)} by ${str(h.go_live_approved_by_label) ?? "the team"}` : "Not yet"}
          </KeyValue>
          <KeyValue label="Texting / email">
            {h.texting_enabled === false ? `Texting off${str(h.texting_off_reason) ? ` (${str(h.texting_off_reason)})` : ""}` : "Texting on"} ·{" "}
            {h.email_enabled === false ? `Email off${str(h.email_off_reason) ? ` (${str(h.email_off_reason)})` : ""}` : "Email on"}
          </KeyValue>
          {str(h.approach_adjust_requested_at) ? (
            <KeyValue label="Approach change asked">{str(h.approach_adjust_note) ?? "No detail given."}</KeyValue>
          ) : null}
          {str(h.crm_help_requested_at) ? (
            <KeyValue label="CRM help asked">{formatRelative(String(h.crm_help_requested_at), nowIso)}</KeyValue>
          ) : null}
          <KeyValue label="Plan (recorded only)">{str(staff.intended_plan_label) ?? "Not chosen"}</KeyValue>
        </DefinitionList>
      </Panel>

      <Section id="invite" title="Owner invitation">
        {wb.ownerInvite ? (
          <p className={helperClass}>
            Sent to {wb.ownerInvite.email} {formatRelative(wb.ownerInvite.created_at, nowIso)}.{" "}
            {Date.parse(wb.ownerInvite.expires_at) < now ? "The link has expired." : `The link works until ${formatDay(wb.ownerInvite.expires_at)}.`}
          </p>
        ) : null}
        <OwnerInviteControls orgId={orgId} email={wb.ownerInvite?.email ?? null} hasOwner={hasOwner} />
      </Section>

      <Section id="go-live" title={preLive ? "Go-live checks" : "Switching agents on"}>
        {preLive ? (
          <>
            <ul className="divide-y divide-white/[0.06]">
              {wb.header.checks.map((check) => (
                <li key={check.key} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-sm text-white">{check.label}</span>
                    <StatusBadge
                      label={check.accepted ? "Warning accepted" : CHECK_WORD[check.result]}
                      tone={check.accepted ? "neutral" : CHECK_TONE[check.result]}
                    />
                  </div>
                  <p className={helperClass}>{check.reason}</p>
                  {check.accepted ? (
                    <p className={helperClass}>
                      Accepted by {check.accepted_by ?? "a Platform Admin"}: {check.accepted_reason}
                    </p>
                  ) : null}
                  {check.result !== "pass" ? (
                    <Link href={fixHref(check)} className="mt-1 inline-block text-sm text-brand-300 underline underline-offset-2">
                      {check.fix_label}
                    </Link>
                  ) : null}
                  {check.result === "warning" && ctx.isPlatformAdmin ? (
                    <AcceptWarning orgId={orgId} checkKey={check.key} label={check.label} accepted={check.accepted} />
                  ) : null}
                </li>
              ))}
            </ul>
            {!ctx.isPlatformAdmin && wb.header.checks.some((check) => check.result === "warning" && !check.accepted) ? (
              <p className={helperClass}>Only a Platform Admin can accept a warning.</p>
            ) : null}
            <div className="mt-4">
              <ApproveGoLive orgId={orgId} blocked={failing.length > 0 || !str(h.owner_confirmed_at)} />
              {!str(h.owner_confirmed_at) ? <p className={helperClass}>The Owner has not said they are ready yet.</p> : null}
            </div>
          </>
        ) : (
          <>
            <ol className="space-y-2">
              {wb.activation.map((row) => (
                <li key={row.agent} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-white">
                    {row.order}. {AGENTS[row.agent].name}
                  </span>
                  <StatusBadge label={ACTIVATION_STAGE_LABEL[row.stage]} tone={row.stage === "off" ? "neutral" : row.stage === "coming_soon" ? "neutral" : "good"} />
                </li>
              ))}
            </ol>
            {str(h.activation_paused_at) ? (
              <Notice tone="warning" title="Switch-on paused">
                <p className={helperClass}>{str(h.activation_paused_reason) ?? "No reason recorded."}</p>
              </Notice>
            ) : null}
            {h.phase === "activating" && next && !str(h.activation_paused_at) ? (
              <div className="mt-4">
                <ActivateNext orgId={orgId} agent={next} {...activationStepCopy(next, watchDays)} />
              </div>
            ) : null}
            {sentryRow?.stage === "watch" ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-white">Sentry is watching only.</p>
                <p className={helperClass}>
                  {watchUntil && Date.parse(watchUntil) > now
                    ? `The watch period ends ${formatRelative(watchUntil, nowIso)} (${zoned(watchUntil, wb.org.timezone)}). Alerts never switch on by themselves.`
                    : "The watch period is over. Alerts stay off until someone on the team switches them on."}
                </p>
                <SentryAlertsOn orgId={orgId} early={Boolean(watchUntil && Date.parse(watchUntil) > now)} isAdmin={ctx.isPlatformAdmin} />
              </div>
            ) : null}
            {h.phase === "activating" ? (
              <div className="mt-4">
                <ActivationPause orgId={orgId} paused={Boolean(str(h.activation_paused_at))} />
              </div>
            ) : null}
          </>
        )}
      </Section>

      <Section id="stages" title="Every stage">
        <ol className="space-y-3">
          {wb.stages.map((stage) => {
            const label = STAGE_STATUS_LABEL[stage.status];
            const def = stage.definition;
            return (
              <li key={stage.stage_key}>
                <div className="rounded-xl border border-white/[0.06] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 text-sm text-white">
                      {def.position}. {def.staff_label}
                      {def.required_for_go_live ? "" : " (optional)"}
                    </h3>
                    <StatusBadge label={label.label} tone={label.tone} />
                  </div>
                  <p className={helperClass}>
                    {stage.staff_detail ?? stage.detail ?? def.why} · {ownerWord(def.owner)} · {def.time_estimate}
                  </p>
                  {stage.waiting_since && (stage.status === "waiting_on_customer" || stage.status === "waiting_on_team") ? (
                    <p className={helperClass}>Waiting {waitingText(stage.waiting_since, now)}.</p>
                  ) : null}
                  {stage.skip_reason ? <p className={helperClass}>Skipped: {stage.skip_reason}</p> : null}
                  {stage.note ? <p className="mt-1 text-sm text-white">To customer: {stage.note}</p> : null}
                  {stage.staff_note ? <p className="mt-1 text-sm text-silver">Staff note: {stage.staff_note}</p> : null}
                  {stage.eta ? <p className={helperClass}>Expected: {stage.eta}</p> : null}
                  {stage.completed_by_label && stage.status === "done" ? (
                    <p className={helperClass}>
                      Done by {stage.completed_by_label}
                      {stage.finished_at ? ` ${formatRelative(stage.finished_at, nowIso)}` : ""}.
                    </p>
                  ) : null}
                  <StageControls
                    orgId={orgId}
                    stageKey={stage.stage_key}
                    label={def.staff_label}
                    status={stage.status}
                    skipped={stage.manual_state === "skipped"}
                    note={stage.note}
                    staffNote={stage.staff_note}
                    eta={stage.eta}
                    version={stage.version}
                    canNudge={def.owner !== "staff" && (stage.status === "waiting_on_customer" || stage.status === "blocked") && hasOwner}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      <Section id="review" title="Settings review">
        <p className={helperClass}>
          {str(h.config_review_signed_off_at)
            ? `Signed off ${formatRelative(String(h.config_review_signed_off_at), nowIso)}. A later settings change asks for a new sign-off.`
            : "Read the workspace's settings with the customer's approach in mind, then sign off."}
        </p>
        <Link href={enter("/app/settings/configuration")} className="mt-2 inline-block text-sm text-brand-300 underline underline-offset-2">
          Open the settings
        </Link>
        <div className="mt-3">
          <ReviewSignoff orgId={orgId} signedOff={Boolean(str(h.config_review_signed_off_at))} />
        </div>
      </Section>

      <MessagingSection wb={wb} />

      <Section id="email" title="Email sending domain">
        {wb.emailSetup?.team_asked_at ? <p className={helperClass}>The Owner asked the team to add the records ({formatRelative(wb.emailSetup.team_asked_at, nowIso)}).</p> : null}
        {wb.emailSetup?.verified_at ? (
          <p className={helperClass}>Every record was found {formatRelative(wb.emailSetup.verified_at, nowIso)}.</p>
        ) : wb.emailSetup?.lastResult.length ? (
          <p className={helperClass}>
            Last check: {wb.emailSetup.lastResult.filter((row) => row.found).length} of {wb.emailSetup.lastResult.length} records found.
          </p>
        ) : null}
        <EmailRecordsEditor
          orgId={orgId}
          domain={wb.emailSetup?.domain ?? ""}
          recordsText={(wb.emailSetup?.records ?? []).map((row) => `${row.type} ${row.host} ${row.value}${row.purpose ? ` # ${row.purpose}` : ""}`).join("\n")}
          domainConfirmed={wb.readiness?.domain_confirmed ?? false}
        />
      </Section>

      <Section id="people" title="People and escalation">
        <h3 className="text-sm text-white">Escalation contacts, in order</h3>
        {wb.contacts.length ? (
          <ol className="mt-2 space-y-1">
            {wb.contacts.map((contact) => (
              <li key={contact.id} className="text-sm text-white">
                {contact.position}. {contact.display_name} · {channelWord(contact.channel)}
                <span className={helperClass}>
                  {" "}
                  {contact.verified_at ? "confirmed" : contact.test_sent_at ? "test sent, not confirmed" : "not tested"}
                  {contact.member_id ? "" : contact.invite_id ? " · invited" : ""}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={helperClass}>None named yet. Alerts for required levels fall back to the Owner.</p>
        )}
        <h3 className="mt-4 text-sm text-white">Customer team</h3>
        <ul className="mt-2 space-y-1">
          {wb.people.map((person) => (
            <li key={person.id} className="text-sm text-white">
              {person.display_name ?? person.email} · {person.role}
              {person.can_approve ? " · approver" : ""}
              <span className={helperClass}> {person.last_seen_at ? `seen ${formatRelative(person.last_seen_at, nowIso)}` : "not signed in yet"}</span>
            </li>
          ))}
        </ul>
      </Section>

      <ImportSection wb={wb} />

      <Section id="sample" title="Sample lead test">
        {wb.sample ? (
          <DefinitionList>
            <KeyValue label="Result">{sampleWord(String(wb.sample.status))}</KeyValue>
            {str(wb.sample.failed_step) ? <KeyValue label="Stopped at">{String(wb.sample.failed_step)}</KeyValue> : null}
            <KeyValue label="Started">
              {formatRelative(String(wb.sample.created_at), nowIso)} by {str(wb.sample.started_by_label) ?? "someone"}
            </KeyValue>
            <KeyValue label="Cleaned up">
              {str(wb.sample.cleaned_at) ? (wb.sample.cleanup_verified ? "Yes, and checked" : "Yes, but the check found leftovers") : "Not yet"}
            </KeyValue>
          </DefinitionList>
        ) : (
          <p className={helperClass}>Not run yet.</p>
        )}
        <SampleControls
          orgId={orgId}
          runId={str(wb.sample?.id)}
          status={str(wb.sample?.status)}
          cleaned={Boolean(str(wb.sample?.cleaned_at))}
          confirmed={Boolean(str(wb.sample?.confirmed_at))}
        />
      </Section>

      {wb.checkins.length ? (
        <Section id="checkins" title="First-week check-ins">
          <ul className="space-y-4">
            {wb.checkins.map((checkin) => (
              <li key={checkin.id} className="rounded-xl border border-white/[0.06] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm text-white">Day {checkin.day}</h3>
                  <StatusBadge
                    label={checkin.status === "done" ? "Done" : Date.parse(checkin.due_at) <= now ? "Due" : `Due ${formatDay(checkin.due_at)}`}
                    tone={checkin.status === "done" ? "good" : Date.parse(checkin.due_at) <= now ? "warning" : "neutral"}
                  />
                </div>
                {checkin.status === "done" ? (
                  <>
                    <p className="mt-2 text-sm text-white">{checkin.staff_note}</p>
                    <p className={helperClass}>
                      By {checkin.completed_by_label ?? "the team"}
                      {checkin.follow_up_at ? ` · follow up ${formatDay(checkin.follow_up_at)}` : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <ul className="mt-2 space-y-1">
                      {checkin.items.map((item) => (
                        <li key={item.key} className="text-sm">
                          <span className="text-white">{item.question}</span> <span className={item.ok === false ? "text-flag-critical" : "text-silver"}>{item.answer}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3">
                      <CheckinForm orgId={orgId} checkinId={checkin.id} day={checkin.day} />
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section id="details" title="Staff details">
        <StaffDetailsForm
          orgId={orgId}
          internalNote={str(staff.internal_note) ?? ""}
          planLabel={str(staff.intended_plan_label) ?? ""}
          priceId={str(staff.intended_price_id) ?? ""}
          plans={plans}
        />
        {str(staff.created_by_role) ? <p className={helperClass}>Created by {staff.created_by_role === "service_team" ? "Service Team" : "a Platform Admin"}.</p> : null}
      </Section>

      <Section id="status" title={h.phase === "paused" || h.phase === "cancelled" ? "Resume" : "Move back or pause"}>
        <MoveBack orgId={orgId} phase={h.phase} />
      </Section>

      <Section id="activity" title="Activity">
        {wb.activity.length ? (
          <ul className="divide-y divide-white/[0.06]">
            {wb.activity.map((row) => (
              <li key={row.id} className="py-2">
                <span className="text-sm text-white">{activityWord(row.action)}</span>
                <span className={helperClass}>
                  {" "}
                  {row.actor_label} · {formatRelative(row.created_at, nowIso)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={helperClass}>Nothing yet.</p>
        )}
      </Section>
    </PageFrame>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <Panel className="space-y-3 p-6">
        <h2 id={`${id}-title`} className={cardTitle}>
          {title}
        </h2>
        {children}
      </Panel>
    </section>
  );
}

function MessagingSection({ wb }: { wb: Workbench }) {
  const reg = wb.registration;
  const status = (wb.readiness?.carrier_status ?? "not_registered") as keyof typeof CARRIER_STATUS_LABEL;
  return (
    <Section id="messaging" title="Text messaging registration">
      {wb.header.texting_enabled === false ? <p className={helperClass}>The Owner has chosen not to use texting for now.</p> : null}
      <p className="text-sm text-white">{CARRIER_STATUS_LABEL[status] ?? status}</p>
      {reg?.rejection_code ? (
        <p className={helperClass}>
          Told the Owner: {REJECTION_GUIDANCE[reg.rejection_code].reason} Fix: {REJECTION_GUIDANCE[reg.rejection_code].fix}
        </p>
      ) : null}
      {reg ? (
        <>
          <p className={helperClass}>
            {reg.fields_complete ? "Every detail is in." : "Some details are still missing."}
            {reg.saved_at ? ` Last saved by ${reg.saved_by_label ?? "the Owner"}.` : ""} Enter them in the CRM&apos;s phone registration.
          </p>
          {reg.detailsError ? (
            <Notice tone="critical" title="The details could not be read">
              <p className={helperClass}>Ask the Owner to save them again.</p>
            </Notice>
          ) : reg.details ? (
            <DefinitionList>
              {REGISTRATION_FIELDS.map((field) => (
                <KeyValue key={field.key} label={field.label}>
                  {reg.details?.[field.key] || <span className="text-muted-foreground">Not given</span>}
                </KeyValue>
              ))}
            </DefinitionList>
          ) : null}
        </>
      ) : (
        <p className={helperClass}>The Owner has not filled in the registration details yet.</p>
      )}
      <RegistrationStatusForm
        orgId={wb.org.id}
        status={status}
        code={reg?.rejection_code ?? ""}
        note={wb.readiness?.carrier_note ?? ""}
        reference={reg?.external_reference ?? ""}
        einHandled={Boolean(reg?.ein_handled_at)}
        senderConfirmed={wb.readiness?.sender_confirmed ?? false}
      />
    </Section>
  );
}

function ImportSection({ wb }: { wb: Workbench }) {
  const run = wb.importRun;
  const cf = wb.caseFiles;
  const reasons = (run?.skip_reasons ?? {}) as Record<string, number>;
  const found = Number(run?.found ?? 0);
  const handled = Number(run?.imported ?? 0) + Number(run?.updated ?? 0) + Number(run?.skipped ?? 0) + Number(run?.failed ?? 0);
  const open = wb.problems.filter((problem) => problem.decision === "pending");
  const lookback = wb.templateDefaults?.import_lookback_days ?? 90;
  return (
    <Section id="import" title="Lead import">
      {run ? (
        <>
          <p className="text-sm text-white">
            {importWord(String(run.status))} · looking back {String(run.lookback_days)} days
          </p>
          {found > 0 ? <Progress label="Leads handled" value={handled} max={found} valueLabel={`${handled} of ${found}`} /> : null}
          <p className={helperClass}>
            {String(run.imported)} new, {String(run.updated)} updated, {String(run.skipped)} skipped, {String(run.failed)} failed.{" "}
            {String(run.do_not_contact)} kept their do-not-contact flag. Imported leads are history: no alerts, clocks or drafts start for them.
          </p>
          {Object.keys(reasons).length ? (
            <p className={helperClass}>
              Skipped because:{" "}
              {Object.entries(reasons)
                .map(([key, count]) => `${SKIP_REASON_LABEL[key as keyof typeof SKIP_REASON_LABEL] ?? key} (${count})`)
                .join(", ")}
            </p>
          ) : null}
          {str(run.last_error) ? <p className={helperClass}>Last problem: {String(run.last_error)}</p> : null}
        </>
      ) : (
        <p className={helperClass}>Not started.</p>
      )}
      <ImportControls orgId={wb.org.id} status={str(run?.status)} defaultDays={lookback} maxDays={365} />

      {open.length ? (
        <>
          <h3 className="text-sm text-white">Needs a decision ({open.length})</h3>
          <ul className="divide-y divide-white/[0.06]">
            {open.slice(0, 50).map((problem) => (
              <li key={problem.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm text-white">
                  {problem.display_label} <span className={helperClass}>· {PROBLEM_LABEL[problem.kind].one}</span>
                </span>
                <ProblemDecision orgId={wb.org.id} problemId={problem.id} label={problem.display_label} />
              </li>
            ))}
          </ul>
          {open.length > 50 ? <p className={helperClass}>Showing the first 50. The customer can decide them by kind on their import step.</p> : null}
        </>
      ) : null}

      {cf ? (
        <>
          <h3 className="text-sm text-white">Case files</h3>
          <p className={helperClass}>
            Every imported lead gets a basic case file from its CRM details. Full case files are built only for open leads active recently, at most {cf.pace.limit} for this
            workspace and {cf.pace.ratePerHour} an hour{cf.pace.paused ? ". Paused for now" : ""}.
          </p>
          <Progress label="Full case files" value={cf.built} max={Math.max(1, Math.min(cf.pace.limit, cf.built + cf.eligible))} valueLabel={`${cf.built} built, ${cf.eligible} waiting`} />
          <p className={helperClass}>
            {cf.basicOnly} have a basic case file only{cf.overLimit ? `, ${cf.overLimit} of them because the limit was reached` : ""}
            {cf.failed ? `, ${cf.failed} after a failed attempt` : ""}.
          </p>
          <CaseFilePace orgId={wb.org.id} limit={cf.pace.limit} rate={cf.pace.ratePerHour} paused={cf.pace.paused} />
        </>
      ) : null}
    </Section>
  );
}

/** A time in the workspace's own zone, named, since staff and the Owner may be elsewhere. */
function zoned(iso: string, timeZone: string): string {
  const at = new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone });
  return `${at} ${timeZone.replaceAll("_", " ")} time`;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function ownerWord(owner: "customer" | "staff" | "both"): string {
  return owner === "customer" ? "customer does it" : owner === "staff" ? "team does it" : "customer and team";
}

function channelWord(channel: string): string {
  return channel === "sms" || channel === "text" ? "text" : channel === "email" ? "email" : "app";
}

function sampleWord(status: string): string {
  switch (status) {
    case "running":
      return "Running";
    case "passed":
      return "Worked";
    case "failed":
      return "Stopped part way";
    case "problem_reported":
      return "The customer reported a problem";
    default:
      return status;
  }
}

function importWord(status: string): string {
  switch (status) {
    case "queued":
      return "Waiting to start";
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "done":
      return "Finished";
    case "failed":
      return "Stopped (can resume)";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function activityWord(action: string): string {
  const words = action.replace(/^onboarding\./, "").replaceAll(".", " ").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
