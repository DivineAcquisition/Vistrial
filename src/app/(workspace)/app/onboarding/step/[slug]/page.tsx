import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SetupStepFrame } from "@/app/(workspace)/app/onboarding/setup-frame";
import {
  ApproachActions,
  ApproverList,
  AutoRefresh,
  ChannelChoice,
  ConfirmReady,
  CrmHelp,
  EmailRecords,
  EscalationEditor,
  ImportProblems,
  ImportStart,
  InviteTeam,
  NextLink,
  RegistrationForm,
  SampleConfirm,
  SampleStart,
  SampleSteps,
  TeamStepButtons,
  WelcomeContinue,
} from "@/app/(workspace)/app/onboarding/setup-ui";
import { ContactDetailsForm } from "@/app/(workspace)/app/settings/organization/contact-form";
import { OwnerHoursForm } from "@/components/config/owner-hours-form";
import { Button } from "@/components/ui/button";
import { LocationPicker } from "@/components/integrations/location-picker";
import { listSessionLocations } from "@/lib/ghl/connect";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { Panel } from "@/components/ui/panel";
import { Notice } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { AGENTS, AGENT_LIST } from "@/lib/agents/roster";
import { canManageMembers } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import type { ConfigValue } from "@/lib/config/types";
import { ghlOAuthConfigured } from "@/lib/ghl/env";
import { activationStepCopy, ACTIVATION_ORDER } from "@/lib/onboarding/activation";
import { isSetupSlug, nextSlug, setupHref, stepFor, TOTAL_TIME, type SetupSlug } from "@/lib/onboarding/customer-steps";
import { loadCustomerView, type CustomerView } from "@/lib/onboarding/load";
import { SKIP_REASON_LABEL, type SkipReason } from "@/lib/onboarding/import-plan";
import { CARRIER_STATUS_LABEL, REJECTION_GUIDANCE } from "@/lib/onboarding/registration";
import { CUSTOMER_STATE_LABEL } from "@/lib/onboarding/stages";
import { createClient } from "@/lib/supabase/server";
import { cardStack, cardTitle, helperClass, insetSurface } from "@/lib/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup" };

const CRM_ERRORS: Record<string, string> = {
  location_claimed: "That CRM account is already linked to another Vistrial workspace. Ask your team for help.",
  oauth_denied: "The connection was cancelled. You can try again.",
  oauth_invalid: "The connection attempt did not complete. Start it again from here.",
  oauth_expired: "The connection attempt took too long. Start it again from here.",
  oauth_no_location: "Your CRM did not say which account to connect. Ask your team for help.",
  oauth_failed: "The connection could not be completed. Try again, or ask your team for help.",
  staging_blocked: "This account cannot be connected here.",
};

function stageDetail(view: CustomerView, slug: SetupSlug): string | null {
  const stage = stepFor(slug).stage;
  return view.steps.find((step) => step.key === stage)?.detail ?? null;
}

function estimateFor(view: CustomerView, slug: SetupSlug): string | undefined {
  const stage = stepFor(slug).stage;
  return view.steps.find((step) => step.key === stage)?.estimate;
}

function whyFor(view: CustomerView, slug: SetupSlug, fallback: string): string {
  const stage = stepFor(slug).stage;
  return view.steps.find((step) => step.key === stage)?.why ?? fallback;
}

function titleFor(view: CustomerView, slug: SetupSlug, fallback: string): string {
  const stage = stepFor(slug).stage;
  return view.steps.find((step) => step.key === stage)?.label ?? fallback;
}

function comingNext(view: CustomerView, slug: SetupSlug): boolean {
  const stage = stepFor(slug).stage;
  return view.steps.find((step) => step.key === stage)?.state === "coming_next";
}

function minutes(value: number | undefined): string {
  if (!value) return "soon";
  if (value < 60) return `${value} minute${value === 1 ? "" : "s"}`;
  const hours = Math.round(value / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export default async function SetupStepPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  if (!isSetupSlug(slug)) notFound();
  const ctx = await getAuthContext();
  if (!ctx.isStaff && ctx.workspaceRole === "member") redirect("/app/onboarding/progress");
  if (!ctx.isStaff && ctx.workspaceRole !== "owner") notFound();
  const view = await loadCustomerView(ctx.org.id);
  if (!view) notFound();
  const query = await searchParams;
  const one = (key: string) => (Array.isArray(query[key]) ? query[key]?.[0] : query[key]) as string | undefined;
  const db = (await createClient()) as unknown as SupabaseClient;
  const next = nextSlug(slug);
  const nextHref = next ? setupHref(next) : "/app/onboarding";

  const frame = (props: { title: string; why: string; estimate?: string; children: React.ReactNode; hideNext?: boolean; nextLabel?: string }) => (
    <SetupStepFrame slug={slug} view={view} {...props} />
  );

  if (comingNext(view, slug)) {
    return frame({
      title: titleFor(view, slug, "Coming next"),
      why: whyFor(view, slug, ""),
      estimate: estimateFor(view, slug),
      children: (
        <Notice tone="info" title="Coming next">
          <p className={helperClass}>This step opens once the steps before it are done. You can carry on with any other step meanwhile.</p>
        </Notice>
      ),
    });
  }

  switch (slug) {
    case "welcome":
      return frame({
        title: "Welcome to Vistrial",
        why: "Here is what Vistrial does for you, and what setting it up involves.",
        estimate: TOTAL_TIME,
        hideNext: true,
        children: (
          <div className={cardStack}>
            <Panel className="p-6">
              <ul className="space-y-3 text-sm text-white">
                <li>It builds a case file for every lead, from your calls and your CRM, so anyone can pick a lead up.</li>
                <li>It notices when a lead is waiting too long and tells the right person.</li>
                <li>It drafts follow-ups for your approval, so nobody slips through.</li>
              </ul>
            </Panel>
            <Notice tone="success" title="Nothing goes to your leads until you say so">
              <p className={helperClass}>
                Setup never messages a lead. Even after you go live, every message Vistrial drafts waits for a person you choose to approve it.
              </p>
            </Notice>
            <p className={helperClass}>
              You will confirm your setup, connect your CRM and texting, choose who approves and who gets told, and run a test with a practice lead.
              Your team does the technical parts and tells you when something needs you. You can stop at any point and come back; nothing is lost.
            </p>
            <WelcomeContinue href={setupHref("approach")} />
          </div>
        ),
      });

    case "approach": {
      const a = view.approach;
      return frame({
        title: titleFor(view, slug, "Choose your approach"),
        why: whyFor(view, slug, "Vistrial starts from a setup made for businesses like yours."),
        estimate: estimateFor(view, slug),
        children: a.templateName ? (
          <div className={cardStack}>
            <Panel className="p-6">
              <h2 className={cardTitle}>{a.templateName}</h2>
              {a.templateDescription ? <p className={helperClass}>{a.templateDescription}</p> : null}
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">How fast a new lead should hear from you</dt>
                  <dd className="text-white">Within {minutes(a.firstTouchMinutes)}.{a.afterHours === "pause" ? " Outside business hours the clock waits until you open." : ""}</dd>
                </div>
                {a.maxSequenceLength ? (
                  <div>
                    <dt className="text-muted-foreground">Follow-up rhythm</dt>
                    <dd className="text-white">
                      Up to {a.maxSequenceLength} follow-ups{a.maxSequenceDays ? ` over ${a.maxSequenceDays} days` : ""}, each one approved by a person first.
                    </dd>
                  </div>
                ) : null}
                {a.urgencySignals?.length ? (
                  <div>
                    <dt className="text-muted-foreground">What it watches for</dt>
                    <dd className="text-white">{a.urgencySignals.slice(0, 5).join("; ")}.</dd>
                  </div>
                ) : null}
                {a.readyCriteria?.length ? (
                  <div>
                    <dt className="text-muted-foreground">A lead looks ready when</dt>
                    <dd className="text-white">{a.readyCriteria.slice(0, 4).join(" ")}</dd>
                  </div>
                ) : null}
              </dl>
            </Panel>
            {a.adjustRequestedAt && (!a.confirmedAt || a.adjustRequestedAt > a.confirmedAt) ? (
              <Notice tone="info" title="Your team is adjusting it">
                <p className={helperClass}>They will tell you when it is ready to look at again.</p>
              </Notice>
            ) : null}
            <ApproachActions confirmed={Boolean(a.confirmedAt)} nextHref={nextHref} />
          </div>
        ) : (
          <Notice tone="info" title="Your team is choosing your starting setup">
            <p className={helperClass}>Expected within 1 business day. You can carry on with the other steps.</p>
          </Notice>
        ),
      });
    }

    case "business": {
      const { data: ownerView } = await db.rpc("config_owner_view", { p_org_id: ctx.org.id });
      const owner = (ownerView ?? null) as { business_hours?: ConfigValue; timezone?: string; owners_can_edit_hours?: boolean; workspace_version?: number } | null;
      return frame({
        title: titleFor(view, slug, "Business details and hours"),
        why: whyFor(view, slug, "Alerts and follow-ups respect your hours."),
        estimate: estimateFor(view, slug),
        children: (
          <div className={cardStack}>
            {stageDetail(view, slug) && view.steps.find((step) => step.key === "business_details")?.state !== "done" ? (
              <p className="text-sm text-white">{stageDetail(view, slug)}</p>
            ) : null}
            <Panel className="p-6">
              <h2 className={cardTitle}>{view.business.name}</h2>
              <p className={helperClass}>
                Time zone: {view.business.timezone.replaceAll("_", " ")}. To change the business name or time zone, ask your team.
              </p>
            </Panel>
            <ContactDetailsForm
              name={view.business.contactName}
              email={view.business.contactEmail}
              phone={view.business.contactPhone}
              address={view.business.address}
            />
            {owner?.business_hours ? (
              <OwnerHoursForm
                orgId={ctx.org.id}
                hours={owner.business_hours}
                timezone={owner.timezone ?? view.business.timezone}
                canEdit={Boolean(owner.owners_can_edit_hours) || ctx.isStaff}
                version={owner.workspace_version ?? 0}
              />
            ) : null}
            <p className={helperClass}>These are the same details shown in Settings, under Workspace.</p>
          </div>
        ),
      });
    }

    case "crm": {
      const { data: connection } = await db.from("ghl_connections").select("status, location_name").eq("org_id", ctx.org.id).maybeSingle();
      const conn = connection as { status: string; location_name: string | null } | null;
      const connected = conn?.status === "active";
      const error = one("ghl_error");
      const locations = one("select_location")
        ? await listSessionLocations(getSupabaseAdmin(), ctx.org.id, ctx.member.id)
        : [];
      return frame({
        title: titleFor(view, slug, "Connect your CRM"),
        why: whyFor(view, slug, "Your leads come from your CRM."),
        estimate: estimateFor(view, slug),
        children: (
          <div className={cardStack}>
            <Panel className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={cardTitle}>Your CRM</h2>
                <StatusBadge
                  label={connected ? (conn?.location_name ?? "Connected") : conn?.status === "broken" ? "Needs reconnecting" : "Not connected"}
                  tone={connected ? "good" : conn?.status === "broken" ? "critical" : "neutral"}
                />
              </div>
              <p className="mt-3 text-sm text-white">
                Vistrial reads your leads, contacts, stages, and users. It does not change anything in your CRM unless you turn that on later.
              </p>
              <p className={helperClass}>It never reads what your leads wrote to you. Only who, when, and which channel.</p>
              {error ? (
                <p role="alert" className="mt-3 text-sm text-flag-critical">
                  {CRM_ERRORS[error] ?? CRM_ERRORS.oauth_failed}
                </p>
              ) : null}
              {locations.length ? <LocationPicker locations={locations} /> : null}
              {connected && one("connected") ? (
                <p role="status" className="mt-3 text-sm text-flag-good">
                  Connected{conn?.location_name ? ` to ${conn.location_name}` : ""}. Your leads can be brought in at the &quot;Bring in your existing leads&quot; step.
                </p>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-2">
                {ghlOAuthConfigured() ? (
                  <Button variant={connected ? "secondary" : "primary"} render={<a href="/api/leadconnector/oauth/start?from=onboarding" />}>
                    {connected ? "Reconnect" : conn?.status === "broken" ? "Reconnect your CRM" : "Connect your CRM"}
                  </Button>
                ) : (
                  <p className={helperClass}>Connecting is not available on this site yet. Ask your team.</p>
                )}
                {connected ? <NextLink href={nextHref} /> : null}
                <Button variant="secondary" render={<Link href="/app/settings/connections" />}>
                  See every source
                </Button>
              </div>
            </Panel>
            {!connected ? (
              <Panel className="p-6">
                <h2 className={cardTitle}>Use a different CRM?</h2>
                <p className={helperClass}>Vistrial connects to one CRM today. Tell your team what you use and they will tell you what is possible.</p>
                <div className="mt-4">
                  <CrmHelp />
                </div>
              </Panel>
            ) : null}
          </div>
        ),
      });
    }

    case "messaging": {
      const m = view.messaging;
      const guidance = m.carrierStatus === "rejected" && m.rejectionCode ? REJECTION_GUIDANCE[m.rejectionCode] : null;
      return frame({
        title: titleFor(view, slug, "Connect messaging"),
        why: whyFor(view, slug, "Business texting needs a registered number and carrier approval."),
        estimate: estimateFor(view, slug),
        children: (
          <div className={cardStack}>
            {!view.textingEnabled ? (
              <ChannelChoice channel="texting" enabled={false} />
            ) : (
              <>
                <Panel className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className={cardTitle}>Carrier registration</h2>
                    <StatusBadge
                      label={CARRIER_STATUS_LABEL[m.carrierStatus]}
                      tone={m.carrierStatus === "approved" ? "good" : m.carrierStatus === "rejected" ? "critical" : m.carrierStatus === "pending" ? "warning" : "neutral"}
                    />
                  </div>
                  <p className="mt-3 text-sm text-white">
                    Phone carriers only deliver business texts from numbers registered to a real business. You give the details once; your team submits
                    them and tells you when they are approved.
                  </p>
                  <p className={helperClass}>
                    {m.carrierStatus === "approved"
                      ? m.senderConfirmed
                        ? "Approved, and your sending number is confirmed."
                        : "Approved. Your team is confirming your sending number."
                      : m.carrierStatus === "pending"
                        ? m.slow
                          ? "This is taking longer than usual. Your team is following up. Everything else can carry on."
                          : "Submitted. Approval usually takes 1 to 3 business days. Everything else can carry on."
                        : m.detailsComplete
                          ? "Your team has your details and will submit them."
                          : "Add your details below. It takes about 10 minutes."}
                  </p>
                </Panel>
                {guidance ? (
                  <Notice tone="critical" title="What the carriers said">
                    <p className="text-sm text-white">{guidance.reason}</p>
                    <p className={helperClass}>What to do: {guidance.fix}</p>
                  </Notice>
                ) : null}
                {m.carrierStatus !== "approved" ? (
                  <Panel className="p-6">
                    <h2 className={cardTitle}>{m.detailsSavedAt ? "Your registration details" : "Add your registration details"}</h2>
                    <div className="mt-4">
                      <RegistrationForm savedFields={m.fieldsSaved} rejection={m.carrierStatus === "rejected" ? m.rejectionCode : null} />
                    </div>
                  </Panel>
                ) : null}
                <ChannelChoice channel="texting" enabled />
              </>
            )}
          </div>
        ),
      });
    }

    case "email": {
      const e = view.email;
      return frame({
        title: titleFor(view, slug, "Email sending"),
        why: whyFor(view, slug, "Verifying your domain helps your emails reach inboxes."),
        estimate: estimateFor(view, slug),
        children: (
          <div className={cardStack}>
            {!view.emailEnabled ? (
              <ChannelChoice channel="email" enabled={false} />
            ) : e.verified ? (
              <Notice tone="success" title="Your email domain is verified">
                <p className={helperClass}>Emails your team approves go out from {e.domain ?? "your domain"}.</p>
              </Notice>
            ) : (
              <>
                <p className="text-sm text-white">
                  To send email from your own address, your domain needs a few records that prove the emails really come from you. Adding them takes
                  about 10 minutes where your domain is managed.
                </p>
                {e.records.length ? (
                  <EmailRecords domain={e.domain} records={e.records} lastResult={e.lastResult} verified={e.verified} teamAsked={Boolean(e.teamAskedAt)} />
                ) : (
                  <>
                    <Notice tone="info" title="Your team is preparing the records">
                      <p className={helperClass}>Expected within 1 business day. You can carry on with other steps.</p>
                    </Notice>
                    <EmailRecords domain={e.domain} records={[]} lastResult={[]} verified={false} teamAsked={Boolean(e.teamAskedAt)} />
                  </>
                )}
                <ChannelChoice channel="email" enabled />
              </>
            )}
          </div>
        ),
      });
    }

    case "approvers": {
      const { data: people } = await db
        .from("org_members")
        .select("id, display_name, email, role, can_approve, last_seen_at")
        .eq("org_id", ctx.org.id)
        .eq("seat", "customer")
        .eq("active", true)
        .in("role", ["owner", "member"])
        .order("role", { ascending: false });
      const rows = ((people ?? []) as Array<{ id: string; display_name: string | null; email: string; role: string; can_approve: boolean; last_seen_at: string | null }>).map((person) => ({
        id: person.id,
        name: person.display_name?.trim() || person.email,
        role: person.role,
        canApprove: person.role === "owner" || person.can_approve,
        signedIn: Boolean(person.last_seen_at),
      }));
      return frame({
        title: titleFor(view, slug, "Choose who approves messages"),
        why: whyFor(view, slug, "Nothing is sent until one of these people approves it."),
        estimate: estimateFor(view, slug),
        children: (
          <div className={cardStack}>
            <Notice tone="success" title="The safe default">
              <p className={helperClass}>
                When {AGENTS.relay.name} drafts a follow-up, it waits here for an approver. Nothing is ever sent without approval. Owners always approve; you
                can let Members approve too.
              </p>
            </Notice>
            <ApproverList people={rows} />
            <p className={helperClass}>To add people who can approve, invite them as Members at the &quot;Invite your team&quot; step.</p>
          </div>
        ),
      });
    }

    case "escalation": {
      const [{ data: people }, { data: invites }, { data: contacts }] = await Promise.all([
        db.from("org_members").select("id, display_name, email, phone, role").eq("org_id", ctx.org.id).eq("seat", "customer").eq("active", true),
        db.from("org_invites").select("id, email").eq("org_id", ctx.org.id).is("accepted_at", null).gt("expires_at", new Date().toISOString()),
        db.from("workspace_escalation_contacts").select("id, member_id, invite_id, display_name, channel, test_sent_at, verified_at").eq("org_id", ctx.org.id).order("position"),
      ]);
      const candidates = [
        ...((people ?? []) as Array<{ id: string; display_name: string | null; email: string; phone: string | null }>).map((person) => ({
          key: `m:${person.id}`,
          memberId: person.id,
          name: person.display_name?.trim() || person.email,
          hasPhone: Boolean(person.phone),
          pending: false,
        })),
        ...((invites ?? []) as Array<{ id: string; email: string }>).map((invite) => ({ key: `i:${invite.id}`, inviteId: invite.id, name: invite.email, hasPhone: false, pending: true })),
      ];
      const rows = ((contacts ?? []) as Array<{ id: string; member_id: string | null; invite_id: string | null; display_name: string; channel: "push" | "email" | "sms"; test_sent_at: string | null; verified_at: string | null }>).map((contact) => ({
        id: contact.id,
        key: contact.member_id ? `m:${contact.member_id}` : `i:${contact.invite_id}`,
        name: contact.display_name,
        channel: contact.channel,
        verified: Boolean(contact.verified_at),
        testSent: Boolean(contact.test_sent_at),
        pending: !contact.member_id,
      }));
      return frame({
        title: titleFor(view, slug, "Set escalation contacts"),
        why: whyFor(view, slug, "When a lead waits too long, Vistrial needs to know who to tell."),
        estimate: estimateFor(view, slug),
        children: (
          <div className={cardStack}>
            <p className="text-sm text-white">
              When a lead is not answered in time, the person it is assigned to hears first. If nobody responds, the people below hear, in this order,
              on the channel you choose. They are also who hears when nobody else can.
            </p>
            <Notice tone="info" title="Someone is always told">
              <p className={helperClass}>The required alert levels always reach someone. If nobody on this list can be reached, the workspace owners are told.</p>
            </Notice>
            <EscalationEditor candidates={candidates} contacts={rows} />
            <p className={helperClass}>After saving, send each person a test. They confirm it from the notification they get.</p>
          </div>
        ),
      });
    }

    case "team": {
      const { data: invites } = await db
        .from("org_invites")
        .select("id, email, role")
        .eq("org_id", ctx.org.id)
        .is("accepted_at", null)
        .neq("role", "owner")
        .gt("expires_at", new Date().toISOString());
      return frame({
        title: titleFor(view, slug, "Invite your team"),
        why: whyFor(view, slug, "Your setters, closers, and managers each see what they need."),
        estimate: estimateFor(view, slug),
        children: (
          <div className={cardStack}>
            <InviteTeam pending={(invites ?? []) as Array<{ id: string; email: string; role: string }>} canInvite={canManageMembers(ctx.role, ctx.isStaff)} />
            <p className={helperClass}>You can skip this and come back later. Before going live you need one approver and one escalation contact, and both can be you.</p>
            <TeamStepButtons nextHref={nextHref} />
          </div>
        ),
      });
    }

    case "import": {
      const imp = view.import;
      const running = imp?.status === "queued" || imp?.status === "running";
      const reasons = Object.entries(imp?.skipReasons ?? {}).filter(([, count]) => count > 0) as Array<[SkipReason, number]>;
      return frame({
        title: titleFor(view, slug, "Bring in your existing leads"),
        why: whyFor(view, slug, "Your existing leads arrive with a starting case file."),
        estimate: estimateFor(view, slug),
        children: (
          <div className={cardStack}>
            <AutoRefresh active={running} />
            <Notice tone="success" title="Older leads are left alone">
              <p className={helperClass}>
                Leads brought in from your CRM get no alerts, no response clock, and no drafts. Vistrial only starts on one when someone on your team works it,
                or the lead gets in touch again.
              </p>
            </Notice>
            {imp ? (
              <Panel className="p-6" as="section">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={cardTitle}>From the last {imp.lookbackDays} days</h2>
                  <StatusBadge
                    label={running ? "Bringing them in" : imp.status === "done" ? "Done" : imp.status === "paused" ? "Paused by your team" : imp.status === "failed" ? "Stopped" : "Cancelled"}
                    tone={imp.status === "done" ? "good" : imp.status === "failed" ? "critical" : "warning"}
                  />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" aria-live="polite">
                  <div>
                    <dt className="text-muted-foreground">Found</dt>
                    <dd className="text-white tabular-nums">{imp.found}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Brought in</dt>
                    <dd className="text-white tabular-nums">{imp.imported}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Left out</dt>
                    <dd className="text-white tabular-nums">{imp.skipped}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Could not read</dt>
                    <dd className="text-white tabular-nums">{imp.failed}</dd>
                  </div>
                </dl>
                {reasons.length ? (
                  <p className={helperClass}>
                    Left out: {reasons.map(([reason, count]) => `${count} ${SKIP_REASON_LABEL[reason] ?? reason.replaceAll("_", " ")}`).join("; ")}.
                  </p>
                ) : null}
                {imp.doNotContact ? (
                  <p className={helperClass}>
                    {imp.doNotContact} {imp.doNotContact === 1 ? "lead is" : "leads are"} marked do-not-contact in your CRM, and Vistrial will never draft for them.
                  </p>
                ) : null}
                <p className={helperClass}>
                  {AGENTS.scribe.name} builds full case files for open leads active in the last {view.importDefaults.aiActiveDays} days, a few at a time.
                  The rest keep a basic case file from your CRM details.
                </p>
                {imp.status === "failed" ? (
                  <p className="mt-3 text-sm text-white">It stopped part way. Your team has been told. Nothing already brought in is lost, and it carries on from where it stopped.</p>
                ) : null}
              </Panel>
            ) : null}
            {imp ? <ImportProblems problems={imp.problems} /> : null}
            {!imp || imp.status === "done" || imp.status === "cancelled" ? (
              view.steps.find((step) => step.key === "crm")?.state === "done" ? (
                <Panel className="p-6">
                  <h2 className={cardTitle}>{imp ? "Bring them in again" : "Choose how far back"}</h2>
                  {imp ? <p className={helperClass}>Running it again never makes duplicates. New leads since last time come in; the rest are left as they are.</p> : null}
                  <div className="mt-4">
                    <ImportStart
                      defaultDays={view.importDefaults.lookbackDays}
                      maxDays={view.importDefaults.maxLookbackDays}
                      aiActiveDays={view.importDefaults.aiActiveDays}
                    />
                  </div>
                </Panel>
              ) : (
                <Notice tone="info" title="Connect your CRM first">
                  <Link href={setupHref("crm")} className="text-sm text-brand-300 underline underline-offset-2">
                    Go to Connect your CRM
                  </Link>
                </Notice>
              )
            ) : null}
          </div>
        ),
      });
    }

    case "agents":
      return frame({
        title: "Meet your agents",
        why: "Four agents do the work. Here is what each does, and what each will never do.",
        estimate: "About 2 minutes to read",
        children: (
          <div className={cardStack}>
            {AGENT_LIST.map((agent) => (
              <Panel key={agent.id} className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={`${cardTitle} ${agent.accent.text}`}>{agent.name}</h2>
                  {agent.id === "compass" ? <StatusBadge label="Switched on last" tone="neutral" /> : null}
                </div>
                <p className="mt-2 text-sm text-white">{agent.role}</p>
                <p className={helperClass}>{agent.description}</p>
                <p className="mt-3 text-sm text-white">What it will not do: {agent.promise}</p>
              </Panel>
            ))}
            <Notice tone="success" title={`${AGENTS.relay.name} only drafts`}>
              <p className={helperClass}>Nothing is sent to a lead without a person approving it first.</p>
            </Notice>
            <div>
              <NextLink href={setupHref("test")} label="Try it with a sample lead" />
            </div>
          </div>
        ),
      });

    case "test": {
      const s = view.sample;
      const running = s?.status === "running";
      return frame({
        title: titleFor(view, slug, "Test with a sample lead"),
        why: whyFor(view, slug, "A practice lead shows the whole path. Nothing is sent."),
        estimate: estimateFor(view, slug),
        children: (
          <div className={cardStack}>
            <AutoRefresh active={running} everyMs={4000} />
            <Notice tone="info" title="Nothing real is sent">
              <p className={helperClass}>
                The sample lead is labeled &quot;Sample lead (test)&quot; everywhere, is never added to your CRM, and never counts in your results. If you approve
                its draft, nothing is sent: the screen tells you it was a test. It is removed when you finish.
              </p>
            </Notice>
            {s && !(s.cleaned && s.confirmedAt) ? (
              <Panel className="p-6" as="section">
                <h2 className={cardTitle}>What is happening</h2>
                <div className="mt-4">
                  <SampleSteps steps={s.steps} />
                </div>
                {s.status === "passed" && s.leadId ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href={`/app/cases/${s.leadId}`} className="text-sm text-brand-300 underline underline-offset-2">
                      Open the case file
                    </Link>
                    <Link href="/app/home" className="text-sm text-brand-300 underline underline-offset-2">
                      See the draft in Needs your approval
                    </Link>
                    <Link href="/app/agents" className="text-sm text-brand-300 underline underline-offset-2">
                      Watch the agents at work
                    </Link>
                  </div>
                ) : null}
                {s.status === "failed" ? (
                  <p className="mt-4 text-sm text-white">The test stopped at: {s.failedStep ?? "a step"}. Your team has been told. You can run it again.</p>
                ) : null}
              </Panel>
            ) : null}
            {s?.status === "passed" && !s.confirmedAt ? <SampleConfirm runId={s.id} /> : null}
            {s?.confirmedAt ? (
              <Notice tone="success" title="The test worked">
                <p className={helperClass}>The sample lead has been removed.</p>
              </Notice>
            ) : null}
            {s?.status === "problem_reported" ? (
              <Notice tone="info" title="Your team is looking at it">
                <p className={helperClass}>You can run the test again once they reply.</p>
              </Notice>
            ) : null}
            {!running && !(s?.status === "passed" && s.confirmedAt) && s?.status !== "passed" ? <SampleStart again={Boolean(s)} /> : null}
          </div>
        ),
      });
    }

    case "review": {
      const required = view.steps.filter((step) => step.required && step.key !== "go_live" && step.key !== "go_live_checks" && step.key !== "first_week" && step.owner !== "staff");
      const ready = ["approvers", "escalation", "sample_test"].every((key) => {
        const state = view.steps.find((step) => step.key === key)?.state;
        return state === "done" || state === "skipped";
      });
      return frame({
        title: titleFor(view, slug, "Review and go live"),
        why: "A summary of what is set up, what happens next, and your go-ahead.",
        estimate: "About 2 minutes",
        hideNext: true,
        children: (
          <div className={cardStack}>
            <Panel className="p-6">
              <h2 className={cardTitle}>What is set up</h2>
              <ul className="mt-3 space-y-2">
                {required.map((step) => (
                  <li key={step.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-white">{step.label}</span>
                    <StatusBadge label={CUSTOMER_STATE_LABEL[step.state].label} tone={CUSTOMER_STATE_LABEL[step.state].tone} />
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel className="p-6">
              <h2 className={cardTitle}>How your agents are switched on</h2>
              <p className={helperClass}>After your team approves, one at a time, so you see each one working before the next starts.</p>
              <ol className="mt-3 space-y-3">
                {ACTIVATION_ORDER.map((agent, index) => {
                  const copy = activationStepCopy(agent, view.sentryWatchDays);
                  const row = view.agents.find((item) => item.agent === agent);
                  return (
                    <li key={agent} className={insetSurface}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-white">
                          {index + 1}. {copy.title}
                        </p>
                        {row && row.stage !== "off" ? <StatusBadge label="Done" tone="good" /> : null}
                      </div>
                      <p className={helperClass}>{copy.plain}</p>
                    </li>
                  );
                })}
              </ol>
            </Panel>
            <Panel className="p-6">
              <h2 className={cardTitle}>Your first week</h2>
              <p className={helperClass}>
                Your team checks in on days {view.checkinDays.join(", ").replace(/, (\d+)$/, ", and $1")} to make sure alerts are being seen and drafts approved. On day 7 you
                will be asked how it is going.
              </p>
            </Panel>
            {view.phase === "setup" ? (
              ready ? (
                ctx.workspaceRole === "owner" ? (
                  <div className={cardStack}>
                    <p className="text-sm text-white">When you confirm, your team reviews everything and approves going live. It is not instant, usually within 1 business day.</p>
                    <ConfirmReady />
                  </div>
                ) : (
                  <p className={helperClass}>The workspace owner confirms this.</p>
                )
              ) : (
                <Notice tone="info" title="A few things first">
                  <p className={helperClass}>Choose an approver and an escalation contact, and run the sample test. Then you can confirm you are ready.</p>
                </Notice>
              )
            ) : view.phase === "ready_for_review" ? (
              <Notice tone="info" title="Your team is reviewing">
                <p className={helperClass}>You confirmed you are ready. They will approve going live once every check passes, and tell you.</p>
              </Notice>
            ) : view.phase === "activating" || view.phase === "live" || view.phase === "settled" ? (
              <Notice tone="success" title={view.phase === "activating" ? "Approved. Your agents are being switched on." : "You are live"}>
                {view.sentryWatchUntil && view.agents.find((row) => row.agent === "sentry")?.stage === "watch" ? (
                  <p className={helperClass}>
                    {AGENTS.sentry.name} is watching only until about {new Date(view.sentryWatchUntil).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: view.business.timezone })} ({view.business.timezone.replaceAll("_", " ")} time).
                    Then your team switches its alerts on.
                  </p>
                ) : null}
              </Notice>
            ) : null}
          </div>
        ),
      });
    }
  }
}
