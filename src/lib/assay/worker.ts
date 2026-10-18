import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logWorkspaceActivity } from "@/lib/workspaces/activity";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { enqueueRelayJob } from "@/lib/relay/run";
import { planActions, type ActionContext, type BillingGate } from "@/lib/assay/decide";
import { defaultRulesetFor, rulesetFromRow, rulesetToRow } from "@/lib/assay/serialize";
import { scoreLead, topReasons } from "@/lib/assay/score";
import { emptyFacts, type CallSignals, type Ruleset, type ScoringFacts, type Tier } from "@/lib/assay/types";
import { proposeAdjustment } from "@/lib/assay/learn";
import { decideWriteback, type WritebackSettings } from "@/lib/assay/writeback";
import { billingFromState } from "@/lib/assay/decide";

type Loose = SupabaseClient;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function daysBetween(from: string | null, now: number): number {
  if (!from) return 0;
  const parsed = Date.parse(from);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, (now - parsed) / 86400000);
}

function hourInZone(now: Date, timeZone: string): number {
  try {
    const hour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).formatToParts(now).find((part) => part.type === "hour")?.value;
    return Number(hour ?? "12");
  } catch {
    return 12;
  }
}

function localDate(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

async function ensureRuleset(db: Loose, orgId: string, slug: string | null): Promise<Ruleset> {
  const { data } = await db.from("assay_rule_versions").select("*").eq("org_id", orgId).eq("active", true).maybeSingle();
  if (data) return rulesetFromRow(data as Record<string, unknown>);
  const seeded = defaultRulesetFor(slug);
  const row = rulesetToRow({ ...seeded, id: crypto.randomUUID(), note: "Industry defaults." }, orgId);
  const { data: inserted, error } = await db.from("assay_rule_versions").insert(row).select("*").maybeSingle();
  if (error || !inserted) {
    const { data: again } = await db.from("assay_rule_versions").select("*").eq("org_id", orgId).eq("active", true).maybeSingle();
    if (again) return rulesetFromRow(again as Record<string, unknown>);
    return seeded;
  }
  return rulesetFromRow(inserted as Record<string, unknown>);
}

export async function loadAssayFacts(db: Loose, orgId: string, leadId: string, now = Date.now()): Promise<{
  facts: ScoringFacts;
  displayName: string;
  ownerId: string | null;
  goLiveAt: string | null;
  billing: BillingGate;
  template: string | null;
  pendingDraft: boolean;
  activePlaybook: boolean;
  previous: { score: number; tier: Tier; fingerprint: string; scoredAt: string } | null;
  openTaskId: string | null;
}> {
  const facts = emptyFacts();
  const [{ data: lead }, { data: opt }, { data: org }, { data: billing }, { data: previous }, { data: touches }, { data: signals }, { data: pending }, { data: sequence }, { data: task }, { data: connection }] =
    await Promise.all([
      db.from("leads").select("id, first_name, email, phone, status, do_not_contact, last_touch_at, assigned_setter_id, assigned_closer_id, application_answers").eq("org_id", orgId).eq("id", leadId).maybeSingle(),
      db.from("lead_opt_outs").select("lead_id").eq("org_id", orgId).eq("lead_id", leadId).maybeSingle(),
      db.from("organizations").select("timezone, industry_template_id").eq("id", orgId).maybeSingle(),
      db.from("billing_accounts").select("state").eq("org_id", orgId).maybeSingle(),
      db.from("assay_lead_scores").select("score, tier, fingerprint, scored_at").eq("org_id", orgId).eq("lead_id", leadId).maybeSingle(),
      db.from("touches").select("direction, outcome, occurred_at, type").eq("org_id", orgId).eq("lead_id", leadId).order("occurred_at", { ascending: false }).limit(40),
      db.from("assay_call_signals").select("signals, call_at").eq("org_id", orgId).eq("lead_id", leadId).maybeSingle(),
      db.from("approval_items").select("id").eq("org_id", orgId).eq("status", "pending").contains("lead_ids", [leadId]).limit(1),
      db.from("follow_up_sequence_runs").select("id").eq("org_id", orgId).eq("lead_id", leadId).eq("status", "active").limit(1),
      db.from("next_actions").select("id").eq("org_id", orgId).eq("lead_id", leadId).eq("source_kind", "assay").in("status", ["open", "suggested", "snoozed"]).limit(1),
      db.from("workspace_connections").select("status, go_live_at").eq("org_id", orgId).eq("status", "live").limit(1),
    ]);

  const leadRow = asRecord(lead);
  const status = String(leadRow?.status ?? "");
  facts.closed = status === "closed_won" || status === "closed_lost";
  facts.doNotContact = leadRow?.do_not_contact === true;
  facts.optedOut = Boolean(opt);
  facts.contactComplete = Boolean(leadRow?.email || leadRow?.phone);
  const answers = asRecord(leadRow?.application_answers);
  if (answers && (answers.owner_occupied === true || answers.owner_occupied === "yes")) facts.custom.owner_occupied = true;
  const rows = (touches ?? []) as Array<{ direction?: string; outcome?: string | null; occurred_at?: string; type?: string }>;
  const inbound = rows.filter((row) => row.direction === "inbound");
  const outbound = rows.filter((row) => row.direction === "outbound");
  facts.booked = status === "call_booked" || rows.some((row) => row.outcome === "booked");
  facts.noShow = status === "no_show";
  facts.twoWayCount14d = inbound.filter((row) => daysBetween(row.occurred_at ?? null, now) <= 14).length;
  const lastInbound = inbound[0]?.occurred_at ?? null;
  const lastOutbound = outbound[0]?.occurred_at ?? null;
  if (lastInbound && lastOutbound && Date.parse(lastInbound) > Date.parse(lastOutbound)) {
    facts.replyMinutes = Math.max(1, Math.round((Date.parse(lastInbound) - Date.parse(lastOutbound)) / 60000));
  }
  facts.leadSilenceDays = lastInbound ? daysBetween(lastInbound, now) : daysBetween(String(leadRow?.last_touch_at ?? "") || null, now);
  facts.teamSilenceDays = lastOutbound ? daysBetween(lastOutbound, now) : daysBetween(String(leadRow?.last_touch_at ?? "") || null, now);
  const stored = asRecord(signals);
  const storedSignals = asRecord(stored?.signals) as CallSignals | null;
  if (storedSignals && storedSignals.timeline) {
    facts.call = { ...storedSignals, ageDays: daysBetween(String(stored?.call_at ?? "") || null, now) };
  }
  const { data: pendingJob } = await db.from("extraction_jobs").select("id").eq("org_id", orgId).eq("status", "pending").limit(1);
  facts.callPending = !facts.call && Boolean(pendingJob);
  const templateId = asRecord(org)?.industry_template_id;
  let template: string | null = null;
  if (typeof templateId === "string") {
    const { data: tpl } = await db.from("config_templates").select("slug").eq("id", templateId).maybeSingle();
    template = typeof (tpl as { slug?: string } | null)?.slug === "string" ? (tpl as { slug: string }).slug : null;
  }
  const live = ((connection ?? []) as Array<{ go_live_at?: string | null }>)[0];
  const prev = asRecord(previous);
  const first = typeof leadRow?.first_name === "string" ? leadRow.first_name : "";
  return {
    facts,
    displayName: first || "this lead",
    ownerId: (typeof leadRow?.assigned_setter_id === "string" && leadRow.assigned_setter_id) || (typeof leadRow?.assigned_closer_id === "string" && leadRow.assigned_closer_id) || null,
    goLiveAt: live?.go_live_at ?? null,
    billing: billingFromState(typeof (billing as { state?: string } | null)?.state === "string" ? (billing as { state: string }).state : null),
    template,
    pendingDraft: Boolean(pending && (pending as unknown[]).length),
    activePlaybook: Boolean(sequence && (sequence as unknown[]).length),
    previous: prev
      ? { score: Number(prev.score), tier: String(prev.tier) as Tier, fingerprint: String(prev.fingerprint ?? ""), scoredAt: String(prev.scored_at ?? "") }
      : null,
    openTaskId: (task as Array<{ id: string }> | null)?.[0]?.id ?? null,
  };
}

async function counts(db: Loose, orgId: string, ownerId: string | null, now: Date) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const day = now.toISOString().slice(0, 10);
  const [{ count: workspaceTasks }, { count: drafts }, { count: person }] = await Promise.all([
    db.from("assay_actions").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", `${day}T00:00:00.000Z`).not("task_id", "is", null),
    db.from("assay_actions").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", `${day}T00:00:00.000Z`).eq("draft", "requested"),
    ownerId
      ? db.from("assay_actions").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("owner_member_id", ownerId).gte("created_at", since).not("task_id", "is", null)
      : Promise.resolve({ count: 0 }),
  ]);
  return { workspaceTasks: workspaceTasks ?? 0, drafts: drafts ?? 0, person: person ?? 0 };
}

export async function scoreOne(db: Loose, job: { id: string; org_id: string; lead_id: string; mode: string; created_at?: string }): Promise<"scored" | "skipped"> {
  const now = new Date();
  const loaded = await loadAssayFacts(db, job.org_id, job.lead_id, now.getTime());
  if (loaded.facts.closed && job.mode !== "historic") {
    await db.from("assay_jobs").update({ status: "done", finished_at: now.toISOString() }).eq("id", job.id);
    return "skipped";
  }
  const ruleset = await ensureRuleset(db, job.org_id, loaded.template);
  const scored = scoreLead({ facts: loaded.facts, ruleset, previousTier: loaded.previous?.tier ?? null });
  const reasons = [...topReasons(scored.fired).up, ...topReasons(scored.fired).down];
  const displayTier = loaded.facts.doNotContact || loaded.facts.optedOut ? "do_not_contact" : scored.tier;
  if (loaded.previous?.fingerprint === scored.fingerprint) {
    await db.from("assay_jobs").update({ status: "done", finished_at: now.toISOString() }).eq("id", job.id);
    return "skipped";
  }
  await db.from("assay_lead_scores").upsert({
    lead_id: job.lead_id,
    org_id: job.org_id,
    score: scored.score,
    tier: scored.tier,
    display_tier: displayTier,
    early: scored.early,
    no_call: scored.noCall,
    call_pending: scored.callPending,
    fit: scored.parts.fit,
    engagement: scored.parts.engagement,
    call_signals: scored.parts.call,
    reasons,
    facts: loaded.facts,
    unclear_call: scored.unclearCall,
    rules_version_id: ruleset.id.startsWith("template:") ? null : ruleset.id,
    fingerprint: scored.fingerprint,
    historic: job.mode === "historic" || job.mode === "rules_change",
    scored_at: now.toISOString(),
  });
  await db.from("assay_score_history").insert({
    org_id: job.org_id,
    lead_id: job.lead_id,
    score: scored.score,
    tier: scored.tier,
    previous_score: loaded.previous?.score ?? null,
    previous_tier: loaded.previous?.tier ?? null,
    cause: job.mode,
    summary: reasons[0]?.reason ?? "Score updated.",
    fingerprint: scored.fingerprint,
  });
  const actionable = job.mode === "live" && Boolean(loaded.goLiveAt);
  const mode = job.mode === "nightly" ? "nightly" : actionable ? "live" : job.mode === "rules_change" ? "rules_change" : "historic";
  const today = await counts(db, job.org_id, loaded.ownerId, now);
  const { data: fires } = await db.from("assay_actions").select("trigger, created_at").eq("org_id", job.org_id).eq("lead_id", job.lead_id).gte("created_at", new Date(now.getTime() - 5 * 86400000).toISOString());
  const lastFiredAt: ActionContext["lastFiredAt"] = {};
  for (const row of (fires ?? []) as Array<{ trigger: string; created_at: string }>) {
    const key = row.trigger as keyof typeof lastFiredAt;
    if (!lastFiredAt[key] || row.created_at > (lastFiredAt[key] ?? "")) lastFiredAt[key] = row.created_at;
  }
  const decision = planActions(scored, {
    mode,
    previousScore: loaded.previous?.score ?? null,
    previousTier: loaded.previous?.tier ?? null,
    score24hAgo: loaded.previous && now.getTime() - Date.parse(loaded.previous.scoredAt) <= 86400000 ? loaded.previous.score : null,
    previousFingerprint: null,
    contactable: !loaded.facts.doNotContact && !loaded.facts.optedOut,
    openTaskId: loaded.openTaskId,
    lastFiredAt,
    now: now.toISOString(),
    personTasksToday: today.person,
    workspaceTasksToday: today.workspaceTasks,
    workspaceDraftsToday: today.drafts,
    pendingDraft: loaded.pendingDraft,
    activePlaybook: loaded.activePlaybook,
    billing: loaded.billing,
    displayName: loaded.displayName,
    triggers: ruleset.triggers,
    caps: ruleset.caps,
    leadSilenceDays: loaded.facts.leadSilenceDays,
    teamSilenceDays: loaded.facts.teamSilenceDays,
    noShow: loaded.facts.noShow,
  });
  let taskId: string | null = null;
  let draft: "none" | "requested" | "boosted" | "skipped" = "none";
  for (const action of decision.actions) {
    if (action.kind === "task") {
      if (action.update && action.taskId) {
        await db.from("next_actions").update({ action_text: action.title, source_sentence: `Assay: ${action.because}` }).eq("id", action.taskId);
        taskId = action.taskId;
      } else if (loaded.ownerId) {
        const { data: created } = await db
          .from("next_actions")
          .insert({
            org_id: job.org_id,
            lead_id: job.lead_id,
            action_text: action.title,
            owner_member_id: loaded.ownerId,
            due_at: now.toISOString(),
            created_by: "system",
            task_type: "call",
            status: "open",
            source_kind: "assay",
            source_sentence: `Assay: ${action.because}`,
            purpose_key: "assay:attention",
          })
          .select("id")
          .maybeSingle();
        taskId = (created as { id?: string } | null)?.id ?? null;
      }
    }
    if (action.kind === "notice") {
      const event = action.trigger === "became_hot" ? "assay_hot" : action.trigger === "hot_no_show" ? "assay_no_show" : action.trigger === "going_quiet" ? "assay_quiet" : "assay_jump";
      if (loaded.ownerId) {
        const { data: member } = await db.from("org_members").select("user_id").eq("id", loaded.ownerId).maybeSingle();
        await enqueueNotification(db as never, {
          orgId: job.org_id,
          eventType: event as never,
          channel: action.urgent ? "push" : "email",
          recipientUserId: (member as { user_id?: string } | null)?.user_id ?? null,
          recipientMemberId: loaded.ownerId,
          subjectKind: "lead",
          subjectIds: [job.lead_id],
          title: action.title,
          body: action.body,
          href: `/app/cases/${job.lead_id}`,
          dedupeKey: `assay:${job.lead_id}:${action.trigger}:${now.toISOString().slice(0, 13)}`,
        });
      }
    }
    if (action.kind === "draft") {
      const trigger = action.style === "reschedule" ? "assay_no_show" : "assay_request";
      await enqueueRelayJob({ orgId: job.org_id, leadId: job.lead_id, trigger, dedupeKey: `assay:${job.lead_id}:${action.trigger}`, note: action.because });
      draft = "requested";
    }
    if (action.kind === "boost") {
      await db.from("approval_items").update({ urgency: 15, reason: `${action.because}. ${"The existing draft stays in the approval queue."}` }).eq("org_id", job.org_id).eq("status", "pending").contains("lead_ids", [job.lead_id]);
      draft = "boosted";
    }
    if (action.kind === "cap") {
      await db.from("assay_daily").upsert({ org_id: job.org_id, day: now.toISOString().slice(0, 10), cap_hit: action.scope }, { onConflict: "org_id,day" });
    }
  }
  if (decision.triggers.length) {
    await db.from("assay_actions").insert({
      org_id: job.org_id,
      lead_id: job.lead_id,
      trigger: decision.triggers[0],
      score_before: loaded.previous?.score ?? null,
      score_after: scored.score,
      task_id: taskId,
      draft,
      owner_member_id: loaded.ownerId,
      idempotency_key: `${job.lead_id}:${decision.triggers[0]}:${scored.fingerprint.slice(0, 16)}`,
    });
    await logWorkspaceActivity({
      actorUserId: null,
      orgId: job.org_id,
      action: "assay.action",
      targetTable: "assay_actions",
      targetId: job.lead_id,
      detail: { trigger: decision.triggers[0], scoreBefore: loaded.previous?.score ?? null, scoreAfter: scored.score, taskId },
    });
  }
  const { data: writeback } = await db.from("assay_writeback").select("*").eq("org_id", job.org_id).maybeSingle();
  const settings = asRecord(writeback);
  const wb: WritebackSettings = {
    enabled: settings?.enabled === true,
    ownerConfirmed: Boolean(settings?.owner_confirmed_at),
    dryRunCompleted: Boolean(settings?.dry_run_completed_at),
    killSwitch: settings?.kill_switch === true,
    connectionLive: Boolean(loaded.goLiveAt),
    target: settings?.target === "tag" ? "tag" : "field",
  };
  const write = decideWriteback({
    settings: wb,
    previousTier: loaded.previous?.tier ?? null,
    nextTier: scored.tier,
    lastWriteAt: typeof settings?.last_write_at === "string" ? settings.last_write_at : null,
    now: now.toISOString(),
    mode: mode === "nightly" ? "nightly" : mode === "live" ? "live" : mode === "rules_change" ? "rules_change" : "historic",
    doNotContact: displayTier === "do_not_contact",
  });
  if (write.action !== "skip") {
    await db.from("assay_writeback_log").insert({ org_id: job.org_id, lead_id: job.lead_id, tier: write.tier, dry_run: write.action === "dry_run" });
  }
  await db.from("assay_jobs").update({ status: "done", finished_at: now.toISOString() }).eq("id", job.id);
  return "scored";
}

export async function runAssayPass(db: Loose): Promise<{ claimed: number; scored: number; decayed: number }> {
  const now = new Date();
  const { data: claimed, error } = await db.rpc("assay_claim_jobs", { p_limit: 40 });
  if (error) throw new Error("assay_claim_failed");
  let scored = 0;
  for (const job of (claimed ?? []) as Array<{ id: string; org_id: string; lead_id: string; mode: string }>) {
    try {
      const result = await scoreOne(db, job);
      if (result === "scored") scored += 1;
    } catch (cause) {
      await db.from("assay_jobs").update({ status: "failed", last_error: cause instanceof Error ? cause.message.slice(0, 120) : "failed" }).eq("id", job.id);
    }
  }
  let decayed = 0;
  const { data: orgs } = await db.from("organizations").select("id, timezone").eq("status", "active").limit(20);
  for (const org of (orgs ?? []) as Array<{ id: string; timezone: string | null }>) {
    const zone = org.timezone || "America/New_York";
    if (hourInZone(now, zone) !== 0) continue;
    const day = localDate(now, zone);
    const { data: state } = await db.from("assay_workspace_state").select("last_decay_on, last_learn_on").eq("org_id", org.id).maybeSingle();
    const stateRow = asRecord(state);
    if (stateRow?.last_decay_on === day) continue;
    const { data: leads } = await db.from("leads").select("id, status").eq("org_id", org.id).eq("is_test", false).limit(120);
    const openLeads = ((leads ?? []) as Array<{ id: string; status: string }>).filter((lead) => lead.status !== "closed_won" && lead.status !== "closed_lost").slice(0, 80);
    for (const lead of openLeads) {
      await db.from("assay_jobs").upsert({ org_id: org.id, lead_id: lead.id, mode: "nightly", event_key: `nightly:${day}:${lead.id}`, status: "pending" }, { onConflict: "org_id,event_key", ignoreDuplicates: true });
      decayed += 1;
    }
    await db.from("assay_workspace_state").upsert({ org_id: org.id, last_decay_on: day });
    if (now.getUTCDate() === 1 && stateRow?.last_learn_on !== day) {
      const { data: closed } = await db.from("assay_lead_scores").select("facts, lead_id").eq("org_id", org.id).limit(80);
      const { data: wonLeads } = await db.from("leads").select("id, status").eq("org_id", org.id).in("status", ["closed_won", "closed_lost"]).limit(80);
      const won = new Set(((wonLeads ?? []) as Array<{ id: string; status: string }>).filter((row) => row.status === "closed_won").map((row) => row.id));
      const examples = ((closed ?? []) as Array<{ facts: ScoringFacts; lead_id: string }>).filter((row) => row.facts && wonLeads?.some((lead) => (lead as { id: string }).id === row.lead_id)).map((row) => ({ facts: row.facts, won: won.has(row.lead_id) }));
      const ruleset = await ensureRuleset(db, org.id, null);
      const proposal = proposeAdjustment({ ruleset, template: defaultRulesetFor(null), examples });
      if (proposal.available) {
        await db.from("assay_proposals").insert({ org_id: org.id, status: "pending", summary: proposal, backtest: proposal.backtest });
      }
      await db.from("assay_workspace_state").upsert({ org_id: org.id, last_decay_on: day, last_learn_on: day });
    }
  }
  return { claimed: (claimed ?? []).length, scored, decayed };
}
