import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";
import type { NeedsPerson, OutputKind, RunStatus, SourceRef } from "@/lib/live/model";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * The one writer for the shared record of agent work. Every agent (and the
 * simulator, through the same path) records runs here. Writes use the service
 * role; reads on screens go through RLS.
 *
 * Rules kept here so no agent can break them:
 * - text is plain language and bounded; transcript or message text never goes
 *   into labels, events, or errors (callers pass references and short quotes
 *   only into outputs a person is allowed to open)
 * - technical detail goes to agent_activity_staff, never to customer columns
 * - the same trigger key twice is one run
 */

type Untyped = SupabaseClient;

function db(): Untyped {
  return getSupabaseAdmin() as unknown as Untyped;
}

function clip(text: string | null | undefined, max: number): string | null {
  if (text == null) return null;
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export type StartRunInput = {
  orgId: string;
  agentId: LiveAgentId;
  triggerKey: string;
  subjectLabel: string;
  subjectHref?: string | null;
  leadId?: string | null;
  actorMemberId?: string | null;
  plan?: string[];
  configVersion?: string | null;
  sources?: SourceRef[];
  simulated?: boolean;
  batchId?: string | null;
};

export type StepHandle = {
  id: string;
  seq: number;
  done: (input?: { detail?: string | null; reason?: string | null; sources?: SourceRef[] }) => Promise<void>;
  fail: (detail?: string | null) => Promise<void>;
  skip: (detail?: string | null) => Promise<void>;
  wait: (detail?: string | null) => Promise<void>;
};

export class RunRecorder {
  readonly id: string;
  readonly orgId: string;
  readonly agentId: LiveAgentId;
  readonly created: boolean;
  private seq = 0;
  private stepTimes = new Map<number, number>();
  private staff: Record<string, unknown> = {};

  constructor(input: { id: string; orgId: string; agentId: LiveAgentId; created: boolean; lastSeq?: number }) {
    this.id = input.id;
    this.orgId = input.orgId;
    this.agentId = input.agentId;
    this.created = input.created;
    this.seq = input.lastSeq ?? 0;
  }

  private async event(kind: string, label: string): Promise<void> {
    await db().from("agent_activity_events").insert({
      org_id: this.orgId,
      run_id: this.id,
      agent_id: this.agentId,
      kind,
      label: clip(label, 300) ?? AGENTS[this.agentId].name,
    });
  }

  private async touch(patch: Record<string, unknown>): Promise<void> {
    await db()
      .from("agent_activity_runs")
      .update({ ...patch, last_progress_at: new Date().toISOString() })
      .eq("id", this.id)
      .eq("org_id", this.orgId);
  }

  async begin(): Promise<void> {
    const now = new Date().toISOString();
    await this.touch({ status: "working", started_at: now });
    await this.event("run_started", `${AGENTS[this.agentId].name} started`);
  }

  async step(label: string, options: { detail?: string | null; sources?: SourceRef[] } = {}): Promise<StepHandle> {
    const seq = ++this.seq;
    const startedAt = Date.now();
    this.stepTimes.set(seq, startedAt);
    const text = clip(label, 200) ?? "Working";
    const { data } = await db()
      .from("agent_activity_steps")
      .insert({
        org_id: this.orgId,
        run_id: this.id,
        agent_id: this.agentId,
        seq,
        label: text,
        status: "working",
        detail: clip(options.detail, 2000),
        sources: options.sources ?? [],
        started_at: new Date(startedAt).toISOString(),
      })
      .select("id")
      .single();
    await this.touch({ status: "working", current_step_label: text });
    await this.event("step_started", text);
    const id = String((data as { id?: string } | null)?.id ?? "");

    const finish = async (
      status: "done" | "failed" | "skipped" | "waiting",
      input: { detail?: string | null; reason?: string | null; sources?: SourceRef[] } = {}
    ) => {
      const finishedAt = Date.now();
      const patch: Record<string, unknown> = {
        status,
        finished_at: status === "waiting" ? null : new Date(finishedAt).toISOString(),
        duration_ms: status === "waiting" ? null : finishedAt - startedAt,
      };
      if (input.detail !== undefined) patch.detail = clip(input.detail, 2000);
      if (input.reason !== undefined) patch.reason = clip(input.reason, 2000);
      if (input.sources) patch.sources = input.sources;
      await db().from("agent_activity_steps").update(patch).eq("run_id", this.id).eq("seq", seq);
      this.staff.steps = { ...(this.staff.steps as object | undefined), [seq]: { label: text, ms: finishedAt - startedAt, status } };
      await this.touch({});
      if (status !== "waiting") await this.event("step_finished", text);
    };

    return {
      id,
      seq,
      done: (input) => finish("done", input),
      fail: (detail) => finish("failed", { detail }),
      skip: (detail) => finish("skipped", { detail }),
      wait: (detail) => finish("waiting", { detail }),
    };
  }

  async output(input: {
    kind: OutputKind;
    title: string;
    body?: string | null;
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    await db().from("agent_activity_outputs").insert({
      org_id: this.orgId,
      run_id: this.id,
      agent_id: this.agentId,
      kind: input.kind,
      title: clip(input.title, 200) ?? "Output",
      body: input.body == null ? null : input.body.slice(0, 8000),
      before_value: input.before ?? null,
      after_value: input.after ?? null,
    });
    await this.touch({});
    await this.event("output", input.title);
  }

  async sources(list: SourceRef[]): Promise<void> {
    await this.touch({ sources: list });
  }

  async needPerson(need: NeedsPerson): Promise<void> {
    await this.touch({ status: "waiting_person", needs_person: need, current_step_label: null });
    await this.event(need.kind === "question" ? "input_needed" : "approval_requested", need.prompt);
  }

  async waitingOnProvider(technical?: string): Promise<void> {
    if (technical) this.staff.provider = technical.slice(0, 2000);
    await this.touch({ status: "waiting_provider", current_step_label: "Waiting on an outside service" });
    await this.flushStaff();
    await this.event("waiting_provider", "Waiting on an outside service. It will continue on its own.");
  }

  noteStaff(key: string, value: unknown): void {
    this.staff[key] = value;
  }

  private async flushStaff(errorDetail?: string | null): Promise<void> {
    await db()
      .from("agent_activity_staff")
      .upsert(
        {
          run_id: this.id,
          org_id: this.orgId,
          detail: this.staff,
          error_detail: errorDetail == null ? undefined : errorDetail.slice(0, 4000),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "run_id" }
      );
  }

  async finish(input: { status?: Extract<RunStatus, "completed" | "needs_person" | "stopped" | "expired">; reason?: string | null } = {}): Promise<void> {
    const status = input.status ?? "completed";
    await this.touch({
      status,
      reason_summary: clip(input.reason, 2000),
      current_step_label: null,
      needs_person: status === "needs_person" ? undefined : null,
      finished_at: new Date().toISOString(),
    });
    await this.flushStaff();
    await this.event("run_finished", input.reason ? clip(input.reason, 300)! : `${AGENTS[this.agentId].name} finished`);
  }

  /** Plain words for the customer; technical detail for staff only. */
  async fail(plain: string, technical?: string | null): Promise<void> {
    await this.touch({
      status: "failed",
      plain_error: clip(plain, 600),
      current_step_label: null,
      finished_at: new Date().toISOString(),
    });
    await this.flushStaff(technical ?? null);
    await this.event("error", clip(plain, 300) ?? "Stopped by an error");
  }
}

export async function startRun(input: StartRunInput): Promise<RunRecorder> {
  const client = db();
  const row = {
    org_id: input.orgId,
    agent_id: input.agentId,
    trigger_key: input.triggerKey.slice(0, 300),
    subject_label: clip(input.subjectLabel, 200) ?? "a piece of work",
    subject_href: input.subjectHref ?? null,
    lead_id: input.leadId ?? null,
    actor_member_id: input.actorMemberId ?? null,
    plan: (input.plan ?? []).map((label) => clip(label, 200)).filter(Boolean),
    config_version: input.configVersion ?? null,
    sources: input.sources ?? [],
    simulated: input.simulated === true,
    batch_id: input.batchId ?? null,
    status: "queued",
  };
  const inserted = await client
    .from("agent_activity_runs")
    .upsert(row, { onConflict: "org_id,agent_id,trigger_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (inserted.error) throw new Error(inserted.error.message);
  if (inserted.data?.id) {
    return new RunRecorder({ id: String(inserted.data.id), orgId: input.orgId, agentId: input.agentId, created: true });
  }
  const existing = await client
    .from("agent_activity_runs")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("agent_id", input.agentId)
    .eq("trigger_key", row.trigger_key)
    .single();
  if (existing.error) throw new Error(existing.error.message);
  const last = await client
    .from("agent_activity_steps")
    .select("seq")
    .eq("run_id", existing.data.id)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  return new RunRecorder({
    id: String(existing.data.id),
    orgId: input.orgId,
    agentId: input.agentId,
    created: false,
    lastSeq: Number((last.data as { seq?: number } | null)?.seq ?? 0),
  });
}

export async function resumeRun(runId: string, orgId: string): Promise<RunRecorder | null> {
  const client = db();
  const { data } = await client
    .from("agent_activity_runs")
    .select("id, agent_id")
    .eq("id", runId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return null;
  const last = await client
    .from("agent_activity_steps")
    .select("seq")
    .eq("run_id", runId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  return new RunRecorder({
    id: runId,
    orgId,
    agentId: data.agent_id as LiveAgentId,
    created: false,
    lastSeq: Number((last.data as { seq?: number } | null)?.seq ?? 0),
  });
}

/** Whether this agent may run in this workspace right now. */
export async function agentMayRun(orgId: string, agentId: LiveAgentId): Promise<{ ok: true } | { ok: false; reason: "workspace" | "paused" }> {
  const client = db();
  const [{ data: org }, { data: control }] = await Promise.all([
    client.from("organizations").select("status").eq("id", orgId).maybeSingle(),
    client.from("agent_presence_controls").select("paused").eq("org_id", orgId).eq("agent_id", agentId).maybeSingle(),
  ]);
  const status = (org as { status?: string } | null)?.status;
  if (status !== "active" && status !== "onboarding") return { ok: false, reason: "workspace" };
  if ((control as { paused?: boolean } | null)?.paused) return { ok: false, reason: "paused" };
  return { ok: true };
}
