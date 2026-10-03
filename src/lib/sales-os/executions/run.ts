import "server-only";

import { decryptSecret } from "@/lib/ghl/crypto";
import type { AssetView } from "@/lib/sales-os/asset-types";
import { loadAsset } from "@/lib/sales-os/assets";
import {
  ASSET_TYPE_COPY,
  DESTINATION_KIND_COPY,
  type DestinationKind,
  type ExecutionType,
  type GateMode,
  type MessageKind,
} from "@/lib/sales-os/catalog";
import { postToDiscord, postToSlack } from "@/lib/sales-os/executions/channels";
import {
  DRIVE_ROOT_FOLDER,
  createDriveDoc,
  driveAccessToken,
  ensureDriveFolder,
} from "@/lib/sales-os/executions/drive";
import {
  markdownToDocHtml,
  normalizeUpdate,
  updateFooter,
  updatePreview,
  type StructuredUpdate,
} from "@/lib/sales-os/executions/format";
import { canRunExecutions, decideGate, inputHash, parseGateMode } from "@/lib/sales-os/executions/gate";
import type {
  DestinationView,
  ExecutionPreview,
  ExecutionRecordView,
  ExecutionToolResult,
  RouteView,
} from "@/lib/sales-os/executions/types";
import type { SalesDb } from "@/lib/sales-os/data";
import type { Json, OrgRole } from "@/types/database";

export type ExecActor = {
  db: SalesDb;
  orgId: string;
  memberId: string;
  userId: string;
  personName: string;
  role: OrgRole;
  conversationId: string;
};

export type UpdateInput = {
  kind: MessageKind;
  destinationId?: string | null;
  title: string;
  summary: string;
  sections: Array<{ heading: string; bullets: string[] }>;
};

export type AssetInput = { assetId: string };

type Destination = DestinationView & { externalRef: string | null };

type Plan = {
  type: ExecutionType;
  destination: Destination;
  channel: Destination | null;
  update: StructuredUpdate | null;
  asset: AssetView | null;
  footer: string;
  plainSummary: string;
  preview: string;
};

export async function loadDestinations(db: SalesDb, orgId: string): Promise<Destination[]> {
  const { data } = await db
    .from("sales_os_destinations")
    .select("id, kind, label, account_label, external_ref, active, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as DestinationKind,
    label: row.label,
    accountLabel: row.account_label,
    externalRef: row.external_ref,
    active: row.active,
    createdAt: row.created_at,
  }));
}

export async function loadRoutes(db: SalesDb, orgId: string): Promise<RouteView[]> {
  const { data } = await db.from("sales_os_routes").select("message_kind, destination_id").eq("org_id", orgId);
  return (data ?? []).map((row) => ({ messageKind: row.message_kind as MessageKind, destinationId: row.destination_id }));
}

export async function loadGateMode(db: SalesDb, orgId: string, type: ExecutionType): Promise<GateMode> {
  const { data } = await db
    .from("sales_os_gates")
    .select("mode")
    .eq("org_id", orgId)
    .eq("execution_type", type)
    .maybeSingle();
  return parseGateMode(data?.mode);
}

async function approvedBefore(db: SalesDb, orgId: string, type: ExecutionType, destinationId: string): Promise<boolean> {
  const { count } = await db
    .from("sales_os_executions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("execution_type", type)
    .eq("destination_id", destinationId)
    .eq("gate_satisfied_by", "in_conversation_approval")
    .eq("status", "succeeded");
  return (count ?? 0) > 0;
}

function where(destination: Destination): string {
  return destination.kind === "google_drive"
    ? `your Google Drive${destination.accountLabel ? ` (${destination.accountLabel})` : ""}`
    : `${destination.label} on ${destination.kind === "slack_channel" ? "Slack" : "Discord"}`;
}

function driveFileName(asset: AssetView): string {
  const date = new Date(asset.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${asset.title} — v${asset.version} (${date})`;
}

type PlanResult = { ok: true; plan: Plan } | { ok: false; error: string };

export async function planExecution(actor: ExecActor, type: ExecutionType, input: unknown): Promise<PlanResult> {
  const destinations = (await loadDestinations(actor.db, actor.orgId)).filter((d) => d.active);
  const routes = await loadRoutes(actor.db, actor.orgId);

  if (type === "post_slack_update" || type === "post_discord_update") {
    const raw = input as UpdateInput;
    const kind: DestinationKind = type === "post_slack_update" ? "slack_channel" : "discord_channel";
    const routed = routes.find((route) => route.messageKind === raw.kind)?.destinationId;
    const id = raw.destinationId || routed;
    const destination = destinations.find((d) => d.id === id);
    if (!destination) {
      return {
        ok: false,
        error: raw.destinationId
          ? "That channel isn't set up in this workspace."
          : `No channel is set up for ${raw.kind} posts. An owner or admin can choose one in Settings.`,
      };
    }
    if (destination.kind !== kind) {
      return { ok: false, error: `${destination.label} is a ${DESTINATION_KIND_COPY[destination.kind]}, not a ${DESTINATION_KIND_COPY[kind]}.` };
    }
    const update = normalizeUpdate({ kind: raw.kind, title: raw.title, summary: raw.summary, sections: raw.sections ?? [] });
    if (!update.title || !update.summary) return { ok: false, error: "A post needs a title and a summary." };
    const footer = updateFooter(actor.personName, raw.kind);
    return {
      ok: true,
      plan: {
        type,
        destination,
        channel: destination,
        update,
        asset: null,
        footer,
        plainSummary: `Post "${update.title}" in ${where(destination)}.`,
        preview: updatePreview(update, footer),
      },
    };
  }

  const { assetId } = input as AssetInput;
  const asset = assetId ? await loadAsset(actor, assetId) : null;
  if (!asset) return { ok: false, error: "That asset isn't in this workspace." };
  if (asset.status !== "current") {
    return { ok: false, error: `That's version ${asset.version}, which has been replaced. Only the current version can leave Vistrial.` };
  }
  const drive = destinations.find((d) => d.kind === "google_drive") ?? null;
  const folder = ASSET_TYPE_COPY[asset.type].folder;
  const fileName = driveFileName(asset);
  const docLine = `Google Doc "${fileName}" in ${DRIVE_ROOT_FOLDER} / ${folder}`;
  const excerpt = asset.body.split("\n").filter(Boolean).slice(0, 6).join("\n");

  if (type === "save_asset_to_drive") {
    if (!drive) return { ok: false, error: "Google Drive isn't connected. An owner or admin can connect it in Settings." };
    return {
      ok: true,
      plan: {
        type,
        destination: drive,
        channel: null,
        update: null,
        asset,
        footer: "",
        plainSummary: `Save "${asset.title}" (version ${asset.version}) as a new Google Doc in ${where(drive)}, inside ${DRIVE_ROOT_FOLDER} / ${folder}.`,
        preview: `${docLine}\n\n${asset.basis}\n\n${excerpt}`,
      },
    };
  }

  const channelId = routes.find((route) => route.messageKind === "asset")?.destinationId;
  const channel = destinations.find((d) => d.id === channelId && d.kind !== "google_drive") ?? null;
  if (!drive && !channel) {
    return { ok: false, error: "There's nowhere set up for assets yet. Connect Google Drive or pick a channel for new assets in Settings." };
  }
  const update = normalizeUpdate({
    kind: "asset",
    title: `New ${asset.typeLabel.toLowerCase()}: ${asset.title}`,
    summary: `Version ${asset.version}. ${asset.basis}`,
    sections: [],
  });
  const footer = updateFooter(actor.personName, "asset");
  const steps = [
    ...(drive ? [`save it as a new Google Doc in ${where(drive)}, inside ${DRIVE_ROOT_FOLDER} / ${folder}`] : []),
    ...(channel ? [`post a note in ${where(channel)}${drive ? " with a link to the doc" : ""}`] : []),
  ];
  return {
    ok: true,
    plan: {
      type,
      destination: drive ?? channel!,
      channel,
      update,
      asset,
      footer,
      plainSummary: `Send "${asset.title}" (version ${asset.version}): ${steps.join(", then ")}.`,
      preview: [drive ? docLine : null, channel ? updatePreview(update, footer) + (drive ? "\n[link to the Google Doc]" : "") : null]
        .filter(Boolean)
        .join("\n\n———\n\n"),
    },
  };
}

function planRecord(plan: Plan): Json {
  return {
    destinationId: plan.destination.id,
    channelId: plan.channel?.id ?? null,
    assetId: plan.asset?.id ?? null,
    assetVersion: plan.asset?.version ?? null,
    update: plan.update,
    footer: plan.footer,
  } as unknown as Json;
}

/**
 * Called by the model runtime before a tool runs. When a person has to
 * approve, the request is recorded now, with the plain-language summary and
 * the exact preview the approval card shows.
 */
export async function requestApprovalIfNeeded(
  actor: ExecActor,
  type: ExecutionType,
  input: unknown,
  toolCallId: string
): Promise<boolean> {
  if (!canRunExecutions(actor.role)) return false;
  const planned = await planExecution(actor, type, input);
  if (!planned.ok) return false;
  const mode = await loadGateMode(actor.db, actor.orgId, type);
  const decision = decideGate(mode, await approvedBefore(actor.db, actor.orgId, type, planned.plan.destination.id));
  if (!decision.needsPerson) return false;
  const { error } = await actor.db.from("sales_os_executions").upsert(
    {
      org_id: actor.orgId,
      conversation_id: actor.conversationId,
      tool_call_id: toolCallId,
      execution_type: type,
      destination_id: planned.plan.destination.id,
      asset_id: planned.plan.asset?.id ?? null,
      plan: planRecord(planned.plan),
      plain_summary: planned.plan.plainSummary,
      preview: planned.plan.preview,
      input_hash: inputHash(type, input),
      gate_mode: mode,
      status: "awaiting_approval",
      requested_by_member_id: actor.memberId,
      requested_by_user_id: actor.userId,
    },
    { onConflict: "conversation_id,tool_call_id", ignoreDuplicates: true }
  );
  if (error) throw new Error("Vistrial couldn't record the request for approval, so it won't run.");
  return true;
}

export type ApprovalDecision = { toolCallId: string; approved: boolean; reason: string | null };

/**
 * Records approvals and rejections from the conversation, as the person who
 * clicked. The database refuses an approver who isn't an owner or admin.
 */
export async function applyApprovalDecisions(
  actor: ExecActor,
  decisions: ApprovalDecision[]
): Promise<Array<{ toolCallId: string; recorded: boolean; error: string | null }>> {
  const out = [];
  for (const decision of decisions) {
    const now = new Date().toISOString();
    const patch = decision.approved
      ? {
          status: "approved",
          gate_satisfied_by: "in_conversation_approval",
          approved_by_member_id: actor.memberId,
          approved_at: now,
        }
      : {
          status: "rejected",
          rejected_by_member_id: actor.memberId,
          rejected_at: now,
          rejection_reason: decision.reason?.trim().slice(0, 500) || "Rejected in the conversation. No reason given.",
        };
    const { data, error } = await actor.db
      .from("sales_os_executions")
      .update(patch)
      .eq("org_id", actor.orgId)
      .eq("conversation_id", actor.conversationId)
      .eq("tool_call_id", decision.toolCallId)
      .eq("status", "awaiting_approval")
      .select("id");
    out.push({
      toolCallId: decision.toolCallId,
      recorded: !error && (data?.length ?? 0) > 0,
      error: error ? (error.code === "42501" ? "Only an owner or admin can approve this." : "That decision couldn't be recorded.") : null,
    });
  }
  return out;
}

function blocked(type: ExecutionType, status: ExecutionToolResult["status"], summary: string, plan: Plan | null): ExecutionToolResult {
  return {
    kind: "execution",
    status,
    executionType: type,
    destinationLabel: plan ? where(plan.destination) : null,
    summary,
    preview: plan?.preview ?? null,
    link: null,
    gateSatisfiedBy: null,
    approvedByName: null,
    error: status === "failed" ? summary : null,
  };
}

async function credential(actor: ExecActor, destinationId: string): Promise<string> {
  const { data, error } = await actor.db.rpc("sales_os_destination_credential", { p_destination_id: destinationId });
  if (error || typeof data !== "string" || !data) throw new Error("Vistrial couldn't open the saved connection for that place.");
  return decryptSecret(data);
}

async function perform(actor: ExecActor, plan: Plan): Promise<{ summary: string; link: string | null; result: Json }> {
  if (plan.type === "post_slack_update" || plan.type === "post_discord_update") {
    const link = await credential(actor, plan.destination.id);
    const res =
      plan.type === "post_slack_update"
        ? await postToSlack(link, plan.destination.label, plan.update!, plan.footer)
        : await postToDiscord(link, plan.destination.label, plan.update!, plan.footer);
    if (!res.ok) throw new Error(res.error);
    return { summary: res.summary, link: null, result: { reference: res.reference } };
  }

  const asset = plan.asset!;
  let docLink: string | null = null;
  const steps: string[] = [];
  const result: Record<string, unknown> = {};
  if (plan.destination.kind === "google_drive") {
    const refreshToken = await credential(actor, plan.destination.id);
    const access = await driveAccessToken(refreshToken);
    const root = plan.destination.externalRef;
    if (!root) throw new Error("The Vistrial folder in Google Drive is missing. Reconnect Drive in Settings.");
    const folder = await ensureDriveFolder(access, ASSET_TYPE_COPY[asset.type].folder, root);
    const file = await createDriveDoc(access, {
      name: driveFileName(asset),
      parentId: folder,
      html: markdownToDocHtml(asset.title, asset.basis, asset.body),
    });
    docLink = file.link;
    result.driveFileId = file.id;
    steps.push(`Saved "${asset.title}" v${asset.version} to Google Drive.`);
  }
  if (plan.type === "deliver_asset" && plan.channel) {
    const update = { ...plan.update!, link: docLink ? { label: "Open the doc", url: docLink } : null };
    const link = await credential(actor, plan.channel.id);
    const res =
      plan.channel.kind === "slack_channel"
        ? await postToSlack(link, plan.channel.label, update, plan.footer)
        : await postToDiscord(link, plan.channel.label, update, plan.footer);
    if (!res.ok) {
      throw new Error(steps.length ? `${steps.join(" ")} Then: ${res.error}` : res.error);
    }
    steps.push(res.summary);
  }
  return { summary: steps.join(" "), link: docLink, result: { ...result, link: docLink } as Json };
}

/**
 * Runs an execution exactly once, and only with its gate satisfied: either a
 * person approved this request in the conversation, or the workspace's
 * setting lets it run without asking. A failure is recorded and not retried.
 */
export async function runExecution(
  actor: ExecActor,
  type: ExecutionType,
  input: unknown,
  toolCallId: string
): Promise<ExecutionToolResult> {
  if (!canRunExecutions(actor.role)) {
    return blocked(type, "permission", "Only an owner or admin can post or save outside Vistrial. Nothing was sent.", null);
  }
  const planned = await planExecution(actor, type, input);
  const hash = inputHash(type, input);
  const { data: existing } = await actor.db
    .from("sales_os_executions")
    .select("id, status, input_hash, gate_satisfied_by, approved_by_member_id, rejection_reason")
    .eq("org_id", actor.orgId)
    .eq("conversation_id", actor.conversationId)
    .eq("tool_call_id", toolCallId)
    .maybeSingle();

  let id: string;
  let satisfiedBy: "prior_configuration" | "in_conversation_approval";
  if (existing) {
    if (existing.status === "awaiting_approval") {
      return blocked(type, "awaiting_approval", "This is waiting for an owner or admin to approve it. Nothing was sent.", planned.ok ? planned.plan : null);
    }
    if (existing.status === "rejected") {
      return blocked(type, "rejected", `This was rejected${existing.rejection_reason ? `: ${existing.rejection_reason}` : ""}. Nothing was sent.`, planned.ok ? planned.plan : null);
    }
    if (existing.status !== "approved") {
      return blocked(type, "blocked", "This one has already been handled. It won't run twice.", planned.ok ? planned.plan : null);
    }
    id = existing.id;
    satisfiedBy = existing.gate_satisfied_by === "prior_configuration" ? "prior_configuration" : "in_conversation_approval";
    if (existing.input_hash !== hash || !planned.ok) {
      await actor.db.from("sales_os_executions").update({ status: "running", started_at: new Date().toISOString() }).eq("id", id).eq("status", "approved");
      const why = !planned.ok ? planned.error : "What was approved isn't what was asked to run.";
      await actor.db
        .from("sales_os_executions")
        .update({ status: "failed", finished_at: new Date().toISOString(), error_text: why })
        .eq("id", id)
        .eq("status", "running");
      return blocked(type, "failed", `${why} Nothing was sent.`, planned.ok ? planned.plan : null);
    }
  } else {
    if (!planned.ok) return blocked(type, "failed", `${planned.error} Nothing was sent.`, null);
    const mode = await loadGateMode(actor.db, actor.orgId, type);
    const decision = decideGate(mode, await approvedBefore(actor.db, actor.orgId, type, planned.plan.destination.id));
    if (decision.needsPerson) {
      return blocked(type, "blocked", `${decision.reason} Nothing was sent.`, planned.plan);
    }
    const { data: inserted, error } = await actor.db
      .from("sales_os_executions")
      .insert({
        org_id: actor.orgId,
        conversation_id: actor.conversationId,
        tool_call_id: toolCallId,
        execution_type: type,
        destination_id: planned.plan.destination.id,
        asset_id: planned.plan.asset?.id ?? null,
        plan: planRecord(planned.plan),
        plain_summary: planned.plan.plainSummary,
        preview: planned.plan.preview,
        input_hash: hash,
        gate_mode: mode,
        status: "approved",
        gate_satisfied_by: "prior_configuration",
        requested_by_member_id: actor.memberId,
        requested_by_user_id: actor.userId,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return blocked(type, "blocked", "The workspace's approval setting didn't allow this to run on its own. Nothing was sent.", planned.plan);
    }
    id = inserted.id;
    satisfiedBy = "prior_configuration";
  }

  const plan = (planned as { ok: true; plan: Plan }).plan;
  const { data: claimed } = await actor.db
    .from("sales_os_executions")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "approved")
    .select("id, approved_by_member_id");
  if (!claimed?.length) return blocked(type, "blocked", "This one has already been handled. It won't run twice.", plan);

  let approvedByName: string | null = null;
  const approver = claimed[0].approved_by_member_id;
  if (approver) {
    const { data: member } = await actor.db.from("org_members").select("display_name").eq("id", approver).maybeSingle();
    approvedByName = member?.display_name ?? null;
  }

  try {
    const done = await perform(actor, plan);
    await actor.db
      .from("sales_os_executions")
      .update({ status: "succeeded", finished_at: new Date().toISOString(), result: done.result, result_summary: done.summary })
      .eq("id", id)
      .eq("status", "running");
    return {
      kind: "execution",
      status: "succeeded",
      executionType: type,
      destinationLabel: where(plan.destination),
      summary: done.summary,
      preview: plan.preview,
      link: done.link,
      gateSatisfiedBy: satisfiedBy,
      approvedByName,
      error: null,
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "It failed for a reason Vistrial couldn't read.";
    await actor.db
      .from("sales_os_executions")
      .update({ status: "failed", finished_at: new Date().toISOString(), error_text: message.slice(0, 1000) })
      .eq("id", id)
      .eq("status", "running");
    return { ...blocked(type, "failed", `${message} It was not retried.`, plan), gateSatisfiedBy: satisfiedBy, approvedByName };
  }
}

function gateReason(mode: string): string {
  if (mode === "ask_first_time") return "This is the first one to this place, so it waits for an OK.";
  if (mode === "automatic") return "This workspace runs these without asking.";
  return "This workspace asks every time.";
}

export async function loadExecutionPreview(
  db: SalesDb,
  orgId: string,
  conversationId: string,
  toolCallId: string
): Promise<ExecutionPreview | null> {
  const { data } = await db
    .from("sales_os_executions")
    .select("status, execution_type, plain_summary, preview, gate_mode, destination_id, rejection_reason, approved_by_member_id, rejected_by_member_id")
    .eq("org_id", orgId)
    .eq("conversation_id", conversationId)
    .eq("tool_call_id", toolCallId)
    .maybeSingle();
  if (!data) return null;
  const destinations = await loadDestinations(db, orgId);
  const destination = destinations.find((d) => d.id === data.destination_id);
  const decider = data.approved_by_member_id ?? data.rejected_by_member_id;
  let decidedByName: string | null = null;
  if (decider) {
    const { data: member } = await db.from("org_members").select("display_name").eq("id", decider).maybeSingle();
    decidedByName = member?.display_name ?? null;
  }
  return {
    status: data.status as ExecutionPreview["status"],
    executionType: data.execution_type as ExecutionType,
    plainSummary: data.plain_summary,
    preview: data.preview,
    destinationLabel: destination ? where(destination) : "a saved destination",
    gateReason: gateReason(data.gate_mode),
    rejectionReason: data.rejection_reason,
    decidedByName,
  };
}

export async function listExecutions(
  db: SalesDb,
  orgId: string,
  options: { from?: string; to?: string; limit?: number } = {}
): Promise<ExecutionRecordView[]> {
  let query = db
    .from("sales_os_executions")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);
  if (options.from) query = query.gte("created_at", options.from);
  if (options.to) query = query.lt("created_at", options.to);
  const [{ data }, destinations, { data: members }] = await Promise.all([
    query,
    loadDestinations(db, orgId),
    db.from("org_members").select("id, display_name").eq("org_id", orgId),
  ]);
  const names = new Map((members ?? []).map((m) => [m.id, m.display_name]));
  const dest = new Map(destinations.map((d) => [d.id, d]));
  return (data ?? []).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    executionType: row.execution_type as ExecutionType,
    plainSummary: row.plain_summary,
    destinationLabel: dest.get(row.destination_id) ? where(dest.get(row.destination_id)!) : "a saved destination",
    status: row.status as ExecutionRecordView["status"],
    gateMode: row.gate_mode,
    gateSatisfiedBy: row.gate_satisfied_by,
    requestedByName: names.get(row.requested_by_member_id) ?? "Unknown",
    approvedByName: row.approved_by_member_id ? names.get(row.approved_by_member_id) ?? null : null,
    rejectedByName: row.rejected_by_member_id ? names.get(row.rejected_by_member_id) ?? null : null,
    rejectionReason: row.rejection_reason,
    resultSummary: row.result_summary,
    errorText: row.error_text,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  }));
}
